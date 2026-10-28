/*
 * Android client surfaces (GPU rendered window contents)
 *
 * Copyright 2026 Hangover Android contributors
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA 02110-1301, USA
 */

/* A Wine process has no Android Surface of its own, so the GPU renders into the
 * window of an AImageReader. Every frame is handed to the display server as an
 * AHardwareBuffer, which composites it on top of the window it belongs to. */

#if 0
#pragma makedep unix
#endif

#include "config.h"

#include <dlfcn.h>
#include <errno.h>
#include <poll.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <android/hardware_buffer.h>
#include <media/NdkImageReader.h>

#include "android.h"
#include "wine/list.h"
#include "wine/debug.h"

WINE_DEFAULT_DEBUG_CHANNEL(android);

#define MAX_BUFFERS   32  /* distinct buffers sent to the server per surface */
/* the server holds one shown, one drawn for the swap in progress and one waiting, and one
 * more lets the newest frame through meanwhile. With two, the producer stalled whenever the
 * server redrew for something else (e.g. the cursor) and frames were dropped in the queue:
 * a game showed 30 instead of 60 per second */
#define MAX_ACQUIRED  4

#define DECL_FUNCPTR(f) static typeof(f) *p##f
DECL_FUNCPTR( AImageReader_newWithUsage );
DECL_FUNCPTR( AImageReader_delete );
DECL_FUNCPTR( AImageReader_getWindow );
DECL_FUNCPTR( AImageReader_setImageListener );
DECL_FUNCPTR( AImageReader_acquireNextImageAsync );
DECL_FUNCPTR( AImage_getHardwareBuffer );
DECL_FUNCPTR( AImage_delete );
DECL_FUNCPTR( AImage_deleteAsync );
DECL_FUNCPTR( AHardwareBuffer_sendHandleToUnixSocket );
DECL_FUNCPTR( AHardwareBuffer_describe );
DECL_FUNCPTR( AHardwareBuffer_acquire );
DECL_FUNCPTR( AHardwareBuffer_release );
DECL_FUNCPTR( ANativeWindow_setBuffersGeometry );
DECL_FUNCPTR( ANativeWindow_getFormat );
#undef DECL_FUNCPTR

struct client_buffer
{
    AHardwareBuffer *ahb;      /* reference kept while known by the server */
    AImage          *image;    /* acquired image using this buffer, until the server releases it */
};

struct android_client_surface
{
    struct client_surface base;
    struct list           entry;       /* entry in the surfaces list */
    UINT                  id;
    pthread_mutex_t       mutex;
    AImageReader         *reader;
    ANativeWindow        *window;      /* owned by the reader */
    int                   width;
    int                   height;
    struct client_buffer  buffers[MAX_BUFFERS];
    int                   buffer_count;
    int                   acquired;    /* images held, sent to the server */
    BOOL                  closing;
    BOOL                  visible;
    struct adisp_rect     sent_rect;   /* last position sent to the server */
    struct timespec       next_present; /* frame limiter deadline */
    long long             frame_interval; /* reset the deadline after a live limit change */
    UINT                  sent_flags;
    HWND                  sent_toplevel;
    UINT                  sent_clip_count;  /* last clip sent, ADISP_CLIP_NONE if none */
    time_t                clip_checked;     /* last check of the clip when presenting */
    struct adisp_rect     sent_clip[ADISP_MAX_CLIP_RECTS];
};

static LONG client_surface_id;
static pthread_mutex_t surfaces_mutex = PTHREAD_MUTEX_INITIALIZER;
static struct list surfaces = LIST_INIT( surfaces );
static pthread_once_t init_once = PTHREAD_ONCE_INIT;
static BOOL media_loaded;

static struct android_client_surface *impl_from_client_surface( struct client_surface *client )
{
    return CONTAINING_RECORD( client, struct android_client_surface, base );
}

static void release_event( const struct adisp_release *release );

static void load_media_libs(void)
{
    void *media, *window;

    if (!(media = dlopen( "libmediandk.so", RTLD_NOW )) || !(window = dlopen( "libnativewindow.so", RTLD_NOW )))
    {
        ERR( "failed to load the media libraries: %s\n", dlerror() );
        return;
    }
#define LOAD_FUNCPTR(lib, f) if (!(p##f = dlsym( lib, #f ))) { ERR( "missing %s\n", #f ); return; }
    LOAD_FUNCPTR( media, AImageReader_newWithUsage );
    LOAD_FUNCPTR( media, AImageReader_delete );
    LOAD_FUNCPTR( media, AImageReader_getWindow );
    LOAD_FUNCPTR( media, AImageReader_setImageListener );
    LOAD_FUNCPTR( media, AImageReader_acquireNextImageAsync );
    LOAD_FUNCPTR( media, AImage_getHardwareBuffer );
    LOAD_FUNCPTR( media, AImage_delete );
    LOAD_FUNCPTR( media, AImage_deleteAsync );
    LOAD_FUNCPTR( window, AHardwareBuffer_sendHandleToUnixSocket );
    LOAD_FUNCPTR( window, AHardwareBuffer_describe );
    LOAD_FUNCPTR( window, AHardwareBuffer_acquire );
    LOAD_FUNCPTR( window, AHardwareBuffer_release );
    LOAD_FUNCPTR( window, ANativeWindow_setBuffersGeometry );
    LOAD_FUNCPTR( window, ANativeWindow_getFormat );
#undef LOAD_FUNCPTR
    if (!display_start_reader( release_event )) WARN( "no display server\n" );
    media_loaded = TRUE;
}

/* send the surface position if it changed, called with the surface mutex held */
static void send_client_surface( struct android_client_surface *surface )
{
    struct adisp_client_surface msg;
    UINT flags = surface->visible && !surface->base.offscreen ? ADISP_CLIENT_VISIBLE : 0;
    struct adisp_rect rect;

    rect.left   = surface->base.monitor_rect.left;
    rect.top    = surface->base.monitor_rect.top;
    rect.right  = surface->base.monitor_rect.right;
    rect.bottom = surface->base.monitor_rect.bottom;
    if (flags == surface->sent_flags && surface->sent_toplevel == surface->base.toplevel &&
        !memcmp( &rect, &surface->sent_rect, sizeof(rect) ))
        return;
    surface->sent_flags = flags;
    surface->sent_toplevel = surface->base.toplevel;
    surface->sent_rect = rect;

    memset( &msg, 0, sizeof(msg) );
    msg.hdr.type = ADISP_REQ_CLIENT_SURFACE;
    msg.hdr.size = sizeof(msg);
    msg.id       = surface->id;
    msg.toplevel = HandleToULong( surface->base.toplevel );
    msg.flags    = flags;
    msg.rect     = rect;
    display_send( &msg, sizeof(msg), -1 );
}

static int scale( int value, int num, int den )
{
    return (long long)value * num / den;
}

/* subtract the visible parts of a window from the region, in the coordinates of the client
 * surface's virtual rect: relative to the toplevel visible rect (its window rect) */
static BOOL subtract_window( HRGN rgn, HWND hwnd, const POINT *origin, UINT dpi )
{
    RECT rect;
    HRGN tmp;
    BOOL ret;

    if (!NtUserIsWindowVisible( hwnd ) || !NtUserGetWindowRect( hwnd, &rect, dpi )) return FALSE;
    OffsetRect( &rect, -origin->x, -origin->y );
    if (IsRectEmpty( &rect )) return FALSE;
    tmp = NtGdiCreateRectRgn( 0, 0, 0, 0 );
    /* a window with a region (SetWindowRgn) only covers that, relative to its window rect */
    if (NtUserGetWindowRgnEx( hwnd, tmp, 0 ) != ERROR) NtGdiOffsetRgn( tmp, rect.left, rect.top );
    else NtGdiSetRectRgn( tmp, rect.left, rect.top, rect.right, rect.bottom );
    ret = NtGdiCombineRgn( rgn, rgn, tmp, RGN_DIFF ) != ERROR;
    NtGdiDeleteObjectApp( tmp );
    return ret;
}

struct clip_order
{
    UINT64 area;
    UINT   index;
};

static int compare_clip_order( const void *p1, const void *p2 )
{
    const struct clip_order *o1 = p1, *o2 = p2;

    if (o1->area != o2->area) return o1->area > o2->area ? -1 : 1;
    return o1->index < o2->index ? -1 : o1->index > o2->index ? 1 : 0;
}

/* keep the max largest of the count rects, in their order: dropping parts only shows what GDI
 * drew there instead of the surface, it never draws the surface over another window */
static UINT reduce_clip_rects( struct adisp_rect *rects, UINT count, UINT max )
{
    struct clip_order *order;
    BYTE *keep;
    UINT i, n;

    if (count <= max) return count;
    if (!(order = malloc( count * (sizeof(*order) + 1) ))) return 0;
    keep = (BYTE *)(order + count);
    for (i = 0; i < count; i++)
    {
        order[i].area  = (UINT64)(rects[i].right - rects[i].left) * (rects[i].bottom - rects[i].top);
        order[i].index = i;
        keep[i] = 0;
    }
    qsort( order, count, sizeof(*order), compare_clip_order );
    for (i = 0; i < max; i++) keep[order[i].index] = 1;
    for (i = n = 0; i < count; i++) if (keep[i]) rects[n++] = rects[i];
    free( order );
    return n;
}

/* from the virtual coordinates of the region to the monitor ones of the surface rect, the edges
 * shared with the windows that cover the surface are scaled the same way, so they don't overlap */
static UINT scale_clip_rects( const RECT *r, UINT count, const RECT *vrect, const RECT *mrect,
                              struct adisp_rect *rects )
{
    int vw = vrect->right - vrect->left, vh = vrect->bottom - vrect->top;
    int mw = mrect->right - mrect->left, mh = mrect->bottom - mrect->top;
    UINT i, n;

    for (i = n = 0; i < count; i++)
    {
        rects[n].left   = mrect->left + scale( r[i].left - vrect->left, mw, vw );
        rects[n].top    = mrect->top + scale( r[i].top - vrect->top, mh, vh );
        rects[n].right  = mrect->left + scale( r[i].right - vrect->left, mw, vw );
        rects[n].bottom = mrect->top + scale( r[i].bottom - vrect->top, mh, vh );
        /* parts thinner than a pixel of the monitor disappear */
        if (rects[n].right > rects[n].left && rects[n].bottom > rects[n].top) n++;
    }
    return n;
}

/* the visible parts of the surface from the region of its virtual rect not covered by the other
 * windows, at most max rects: ADISP_CLIP_NONE if nothing covers it, 0 if it is hidden (or on
 * failure, not to draw it over the other windows) */
static UINT get_region_clip( HRGN rgn, BOOL covered, const RECT *vrect, const RECT *mrect,
                             struct adisp_rect *rects, UINT max )
{
    struct adisp_rect *all = rects;
    UINT count = 0, size;
    RGNDATA *data;

    if (!covered) return ADISP_CLIP_NONE;
    if (!(size = NtGdiGetRegionData( rgn, 0, NULL )) || !(data = malloc( size ))) return 0;
    if (NtGdiGetRegionData( rgn, size, data ) &&
        (data->rdh.nCount <= max || (all = malloc( data->rdh.nCount * sizeof(*all) ))))
    {
        count = scale_clip_rects( (const RECT *)data->Buffer, data->rdh.nCount, vrect, mrect, all );
        if (all != rects)
        {
            if (count > max) WARN( "%u visible parts, only keeping the %u largest ones\n", count, max );
            count = reduce_clip_rects( all, count, max );
            memcpy( rects, all, count * sizeof(*rects) );
            free( all );
        }
    }
    free( data );
    return count;
}

/* The parts of the surface that no window of its toplevel covers (its children, the siblings
 * above it and above each of its ancestors), in the coordinates of the surface rect sent to the
 * server, at most max: ADISP_CLIP_NONE when nothing covers it, see get_region_clip. */
static UINT get_client_clip( struct android_client_surface *surface, struct adisp_rect *rects, UINT max )
{
    HWND hwnd = surface->base.hwnd, toplevel = surface->base.toplevel, win, other;
    RECT vrect = surface->base.virtual_rect, mrect = surface->base.monitor_rect;
    UINT dpi = NtUserGetDpiForWindow( hwnd ), count;
    int vw = vrect.right - vrect.left, vh = vrect.bottom - vrect.top;
    BOOL covered = FALSE;
    POINT origin;
    HRGN rgn;

    if (!toplevel || vw <= 0 || vh <= 0) return ADISP_CLIP_NONE;
    /* the virtual rect is the client rect of the window, relative to the toplevel visible rect:
     * where that is on the screen */
    origin.x = origin.y = 0;
    NtUserMapWindowPoints( hwnd, 0, &origin, 1, dpi );
    origin.x -= vrect.left;
    origin.y -= vrect.top;

    rgn = NtGdiCreateRectRgn( vrect.left, vrect.top, vrect.right, vrect.bottom );
    for (other = NtUserGetWindowRelative( hwnd, GW_CHILD ); other; other = NtUserGetWindowRelative( other, GW_HWNDNEXT ))
        covered |= subtract_window( rgn, other, &origin, dpi );
    for (win = hwnd; win && win != toplevel; win = NtUserGetAncestor( win, GA_PARENT ))
        for (other = NtUserGetWindowRelative( win, GW_HWNDPREV ); other; other = NtUserGetWindowRelative( other, GW_HWNDPREV ))
            covered |= subtract_window( rgn, other, &origin, dpi );

    count = get_region_clip( rgn, covered, &vrect, &mrect, rects, max );
    NtGdiDeleteObjectApp( rgn );
    return count;
}

/* send the clip of the surface if it changed, called with the surface mutex held */
static void send_client_clip( struct android_client_surface *surface )
{
    struct adisp_client_clip *msg;
    UINT count, n;

    if (!(msg = malloc( offsetof( struct adisp_client_clip, rects[ADISP_MAX_CLIP_RECTS] ) ))) return;
    count = get_client_clip( surface, msg->rects, ADISP_MAX_CLIP_RECTS );
    n = count == ADISP_CLIP_NONE ? 0 : count;

    if (count == surface->sent_clip_count &&
        !memcmp( msg->rects, surface->sent_clip, n * sizeof(msg->rects[0]) ))
    {
        free( msg );
        return;
    }
    surface->sent_clip_count = count;
    memcpy( surface->sent_clip, msg->rects, n * sizeof(msg->rects[0]) );

    TRACE( "%s clip %u rects\n", debugstr_client_surface( &surface->base ), count );
    msg->hdr.type = ADISP_REQ_CLIENT_CLIP;
    msg->hdr.size = offsetof( struct adisp_client_clip, rects[n] );
    msg->id       = surface->id;
    msg->count    = count;
    display_send( msg, msg->hdr.size, -1 );
    free( msg );
}

/* forget the buffers known by the server, called with the surface mutex held */
static void reset_buffers( struct android_client_surface *surface )
{
    int i;

    for (i = 0; i < surface->buffer_count; i++)
    {
        if (surface->buffers[i].image) continue;  /* still in use, keep it */
        pAHardwareBuffer_release( surface->buffers[i].ahb );
        surface->buffers[i].ahb = NULL;
    }
    /* compact the list, the server replaces buffers that are sent again as new */
    surface->buffer_count = 0;
    for (i = 0; i < MAX_BUFFERS; i++)
        if (surface->buffers[i].ahb) surface->buffer_count = i + 1;
}

static int find_buffer( struct android_client_surface *surface, AHardwareBuffer *ahb, BOOL *is_new )
{
    int i, free_slot = -1;

    *is_new = FALSE;
    for (i = 0; i < surface->buffer_count; i++)
    {
        if (surface->buffers[i].ahb == ahb) return i;
        if (!surface->buffers[i].ahb && free_slot == -1) free_slot = i;
    }
    if (free_slot == -1)
    {
        if (surface->buffer_count == MAX_BUFFERS)
        {
            reset_buffers( surface );
            return find_buffer( surface, ahb, is_new );
        }
        free_slot = surface->buffer_count++;
    }
    /* the reference keeps the pointer from being reused for another buffer */
    pAHardwareBuffer_acquire( ahb );
    surface->buffers[free_slot].ahb = ahb;
    *is_new = TRUE;
    return free_slot;
}

/* acquire queued frames and send them, called with the surface mutex held */
static void acquire_frames( struct android_client_surface *surface )
{
    while (!surface->closing && surface->acquired < MAX_ACQUIRED)
    {
        struct adisp_client_buffer msg;
        AHardwareBuffer *ahb = NULL;
        AHardwareBuffer_Desc desc;
        AImage *image;
        BOOL is_new;
        int fence = -1, index;

        if (pAImageReader_acquireNextImageAsync( surface->reader, &image, &fence ) != AMEDIA_OK) break;

        if (fence != -1)
        {
            /* the server must not sample the buffer before the rendering is complete */
            struct pollfd pfd = { .fd = fence, .events = POLLIN };
            while (poll( &pfd, 1, -1 ) == -1 && errno == EINTR);
            close( fence );
        }

        if (pAImage_getHardwareBuffer( image, &ahb ) != AMEDIA_OK || !ahb)
        {
            pAImage_delete( image );
            continue;
        }
        pAHardwareBuffer_describe( ahb, &desc );
        index = find_buffer( surface, ahb, &is_new );
        if (is_new) TRACE( "surface %u new buffer %d %ux%u format %u usage %#llx\n", surface->id, index,
                           desc.width, desc.height, desc.format, (unsigned long long)desc.usage );
        if (surface->buffers[index].image)
        {
            /* should not happen, the producer can't reuse a buffer we hold */
            WARN( "buffer %d still in use\n", index );
            pAImage_delete( surface->buffers[index].image );
            surface->acquired--;
        }
        surface->buffers[index].image = image;
        surface->acquired++;

        memset( &msg, 0, sizeof(msg) );
        msg.hdr.type = ADISP_REQ_CLIENT_BUFFER;
        msg.hdr.size = sizeof(msg);
        msg.id       = surface->id;
        msg.buffer   = index;
        msg.flags    = is_new ? ADISP_BUFFER_NEW : 0;
        msg.width    = desc.width;
        msg.height   = desc.height;
        if (!display_send_buffer( &msg, sizeof(msg), is_new ? ahb : NULL, pAHardwareBuffer_sendHandleToUnixSocket ))
        {
            /* no server, don't hold the producer */
            surface->buffers[index].image = NULL;
            surface->acquired--;
            pAImage_delete( image );
        }
    }
}

/***********************************************************************
 *           image_available
 *
 * AImageReader callback, called on a thread of the image reader.
 */
static void image_available( void *context, AImageReader *reader )
{
    struct android_client_surface *surface = context;

    pthread_mutex_lock( &surface->mutex );
    acquire_frames( surface );
    pthread_mutex_unlock( &surface->mutex );
}

/***********************************************************************
 *           release_event
 *
 * The server doesn't use a buffer anymore, called on the display reader thread.
 */
static void release_event( const struct adisp_release *release )
{
    struct android_client_surface *surface;

    pthread_mutex_lock( &surfaces_mutex );
    LIST_FOR_EACH_ENTRY( surface, &surfaces, struct android_client_surface, entry )
    {
        if (surface->id != release->id) continue;
        pthread_mutex_lock( &surface->mutex );
        if (release->buffer < surface->buffer_count && surface->buffers[release->buffer].image)
        {
            pAImage_delete( surface->buffers[release->buffer].image );
            surface->buffers[release->buffer].image = NULL;
            surface->acquired--;
            acquire_frames( surface );
        }
        pthread_mutex_unlock( &surface->mutex );
        break;
    }
    pthread_mutex_unlock( &surfaces_mutex );
}

static void android_client_surface_destroy( struct client_surface *client )
{
    struct android_client_surface *surface = impl_from_client_surface( client );
    struct adisp_client_destroy msg;
    int i;

    TRACE( "%s\n", debugstr_client_surface( client ));

    pthread_mutex_lock( &surfaces_mutex );
    list_remove( &surface->entry );
    pthread_mutex_unlock( &surfaces_mutex );

    msg.hdr.type = ADISP_REQ_CLIENT_DESTROY;
    msg.hdr.size = sizeof(msg);
    msg.id       = surface->id;
    msg.reserved = 0;
    display_send( &msg, sizeof(msg), -1 );

    /* AImageReader_delete waits for the listener with the reader lock held, so make sure
     * that a pending callback doesn't touch the reader anymore, and release the images first */
    pthread_mutex_lock( &surface->mutex );
    surface->closing = TRUE;
    for (i = 0; i < surface->buffer_count; i++)
    {
        if (surface->buffers[i].image) pAImage_delete( surface->buffers[i].image );
        if (surface->buffers[i].ahb) pAHardwareBuffer_release( surface->buffers[i].ahb );
    }
    pthread_mutex_unlock( &surface->mutex );
    if (surface->reader) pAImageReader_delete( surface->reader );
    pthread_mutex_destroy( &surface->mutex );
}

static void android_client_surface_detach( struct client_surface *client )
{
    struct android_client_surface *surface = impl_from_client_surface( client );

    TRACE( "%s\n", debugstr_client_surface( client ));
    pthread_mutex_lock( &surface->mutex );
    surface->visible = FALSE;
    send_client_surface( surface );
    pthread_mutex_unlock( &surface->mutex );
}

static void android_client_surface_update( struct client_surface *client )
{
    struct android_client_surface *surface = impl_from_client_surface( client );

    TRACE( "%s toplevel %p rect %s\n", debugstr_client_surface( client ), client->toplevel,
           wine_dbgstr_rect( &client->monitor_rect ));
    pthread_mutex_lock( &surface->mutex );
    surface->visible = NtUserIsWindowVisible( client->hwnd );
    send_client_surface( surface );
    if (surface->visible) send_client_clip( surface );
    pthread_mutex_unlock( &surface->mutex );
}

static LONG frame_rate = -1;

void android_client_set_frame_rate( unsigned int fps )
{
    if (fps > 1000) return;
    InterlockedExchange( &frame_rate, fps );
    TRACE( "display server frame rate limit %u fps\n", fps );
}

static long long get_frame_interval(void)
{
    LONG fps = InterlockedCompareExchange( &frame_rate, -1, -1 );

    if (fps == -1)
    {
        const char *str = getenv( "WINE_ANDROID_FPS" );
        LONG initial = str ? atoi( str ) : 60;
        if (initial < 0 || initial > 1000) initial = 60;
        fps = InterlockedCompareExchange( &frame_rate, initial, -1 );
        if (fps == -1) fps = initial;
    }
    return fps > 0 ? 1000000000ll / fps : 0;
}

static void android_client_surface_present( struct client_surface *client, HDC hdc )
{
    struct android_client_surface *surface = impl_from_client_surface( client );
    long long interval = get_frame_interval(), diff;
    struct timespec now;

    if (surface->frame_interval != interval)
    {
        surface->frame_interval = interval;
        memset( &surface->next_present, 0, sizeof(surface->next_present) );
    }

    /* the windows above it may change without an update of this surface (windows of another
     * process, windows destroyed with their thread): check the clip again now and then */
    clock_gettime( CLOCK_MONOTONIC, &now );
    if (now.tv_sec != surface->clip_checked)
    {
        surface->clip_checked = now.tv_sec;
        pthread_mutex_lock( &surface->mutex );
        if (surface->visible) send_client_clip( surface );
        pthread_mutex_unlock( &surface->mutex );
    }

    /* Frames are sent as soon as the image reader receives them, but the producer of an
     * image reader never blocks, so limit the frame rate here (like a vsync wait would) */
    if (!interval) return;
    clock_gettime( CLOCK_MONOTONIC, &now );
    diff = (surface->next_present.tv_sec - now.tv_sec) * 1000000000ll +
           (surface->next_present.tv_nsec - now.tv_nsec);
    if (diff > 0 && diff <= interval)
    {
        struct timespec wait = { diff / 1000000000ll, diff % 1000000000ll };
        /* with the GL calls serialized, wait once out of the lock not to hold the other threads back */
        if (!opengl_serialize_defer_wait( &surface->next_present ))
            while (nanosleep( &wait, &wait ) == -1 && errno == EINTR);
        now = surface->next_present;
    }
    now.tv_nsec += interval;
    now.tv_sec += now.tv_nsec / 1000000000;
    now.tv_nsec %= 1000000000;
    surface->next_present = now;
}

static const struct client_surface_funcs android_client_surface_funcs =
{
    .size = sizeof(struct android_client_surface),
    .destroy = android_client_surface_destroy,
    .detach = android_client_surface_detach,
    .update = android_client_surface_update,
    .present = android_client_surface_present,
};

/***********************************************************************
 *           ANDROID_CreateClientSurface
 */
struct client_surface *ANDROID_CreateClientSurface( HWND hwnd, int pixel_format, BOOL raw )
{
    struct android_client_surface *surface;
    AImageReader_ImageListener listener;
    RECT rect;
    media_status_t status;

    pthread_once( &init_once, load_media_libs );
    if (!media_loaded) return NULL;
    if (!(surface = client_surface_create( &android_client_surface_funcs, hwnd, pixel_format, raw ))) return NULL;

    pthread_mutex_init( &surface->mutex, NULL );
    surface->id = InterlockedIncrement( &client_surface_id );
    surface->sent_flags = ~0u;
    surface->sent_clip_count = ADISP_CLIP_NONE;

    NtUserGetClientRect( hwnd, &rect, NtUserGetWinMonitorDpi( hwnd, MDT_RAW_DPI ) );
    surface->width = max( rect.right - rect.left, 1 );
    surface->height = max( rect.bottom - rect.top, 1 );

    /* PRIVATE accepts whatever format the swapchain picks */
    status = pAImageReader_newWithUsage( surface->width, surface->height, AIMAGE_FORMAT_PRIVATE,
                                         AHARDWAREBUFFER_USAGE_GPU_SAMPLED_IMAGE |
                                         AHARDWAREBUFFER_USAGE_GPU_COLOR_OUTPUT,
                                         MAX_ACQUIRED, &surface->reader );
    if (status != AMEDIA_OK || pAImageReader_getWindow( surface->reader, &surface->window ) != AMEDIA_OK)
    {
        ERR( "failed to create the image reader %ux%u: %d\n", surface->width, surface->height, status );
        surface->reader = NULL;
        pthread_mutex_lock( &surfaces_mutex );
        list_init( &surface->entry );
        pthread_mutex_unlock( &surfaces_mutex );
        client_surface_release( &surface->base );
        return NULL;
    }

    pthread_mutex_lock( &surfaces_mutex );
    list_add_tail( &surfaces, &surface->entry );
    pthread_mutex_unlock( &surfaces_mutex );

    listener.context = surface;
    listener.onImageAvailable = image_available;
    pAImageReader_setImageListener( surface->reader, &listener );

    TRACE( "created %s id %u size %ux%u\n", debugstr_client_surface( &surface->base ), surface->id,
           surface->width, surface->height );
    return &surface->base;
}

struct ANativeWindow *get_client_surface_window( struct client_surface *client )
{
    return impl_from_client_surface( client )->window;
}

/* set the size of the buffers the producer (EGL, Vulkan) dequeues, when the window was resized */
void set_client_surface_size( struct client_surface *client, int width, int height )
{
    struct android_client_surface *surface = impl_from_client_surface( client );

    pthread_mutex_lock( &surface->mutex );
    if (width > 0 && height > 0 && (width != surface->width || height != surface->height))
    {
        TRACE( "%s %dx%d -> %dx%d\n", debugstr_client_surface( client ), surface->width, surface->height, width, height );
        surface->width = width;
        surface->height = height;
        /* keep the format the producer chose: 0 would bring back the reader's (PRIVATE, implementation
         * defined), which the allocator may not have for GPU rendering, and zink's swapchain stops
         * (the window of a DirectDraw game resized for its display mode stayed white) */
        pANativeWindow_setBuffersGeometry( surface->window, width, height,
                                           max( 0, pANativeWindow_getFormat( surface->window )));
    }
    pthread_mutex_unlock( &surface->mutex );
}
