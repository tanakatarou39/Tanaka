/* Builds with mingw and runs on Wine: the clip code of the Android client surfaces
 * (wineandroid.drv/client.c, before and after the patch, extracted unchanged into
 * client_orig.inc and client_new.inc) on real windows with child windows, then the
 * display server (req_client_clip of app/jni/server.c, draw_client_surfaces of
 * app/jni/render.c, extracted unchanged into server.inc) drawing the surface with it.
 *
 * Checks, pixel by pixel, that the GPU surface is drawn exactly in the part of the
 * window presented to (the destination rect of a D3D9 Present) that no child window
 * covers, so the window surface (GDI) shows everywhere else, and that nothing changes
 * when the whole window is presented (an ordinary game). */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <windows.h>

#define ARRAY_SIZE( a ) (sizeof(a) / sizeof((a)[0]))

/* android_display.h */
#define ADISP_CLIP_NONE      0xffffffff
#define ADISP_MAX_CLIP_RECTS 2048
#define ADISP_MAX_MSG_SIZE   (128 * 1024)
#define ADISP_CLIENT_VISIBLE 0x0001
struct adisp_rect { int32_t left, top, right, bottom; };
struct adisp_header { uint32_t type, size; };
struct adisp_client_clip
{
    struct adisp_header hdr;
    uint32_t id;
    uint32_t count;
    struct adisp_rect rects[1];
};

/* include/wine/gdi_driver.h, the fields used */
struct client_surface
{
    HWND hwnd;
    HWND toplevel;
    RECT virtual_rect;
    RECT monitor_rect;
    RECT presented_rect;
};
struct android_client_surface { struct client_surface base; };

/* win32u functions used by the client code */
#define NtUserIsWindowVisible( hwnd ) IsWindowVisible( hwnd )
#define NtUserGetWindowRect( hwnd, rect, dpi ) GetWindowRect( hwnd, rect )
#define NtUserGetWindowRgnEx( hwnd, rgn, unk ) GetWindowRgn( hwnd, rgn )
#define NtUserGetDpiForWindow( hwnd ) 96
#define NtUserMapWindowPoints( from, to, pts, count, dpi ) MapWindowPoints( from, to, pts, count )
#define NtUserGetWindowRelative( hwnd, rel ) GetWindow( hwnd, rel )
#define NtUserGetAncestor( hwnd, type ) GetAncestor( hwnd, type )
#define NtGdiCreateRectRgn( l, t, r, b ) CreateRectRgn( l, t, r, b )
#define NtGdiOffsetRgn( rgn, x, y ) OffsetRgn( rgn, x, y )
#define NtGdiSetRectRgn( rgn, l, t, r, b ) SetRectRgn( rgn, l, t, r, b )
#define NtGdiCombineRgn( d, a, b, mode ) CombineRgn( d, a, b, mode )
#define NtGdiDeleteObjectApp( obj ) DeleteObject( obj )
#define NtGdiGetRegionData( rgn, size, data ) GetRegionData( rgn, size, data )
static int warnings;
#define WARN( ... ) (warnings++)

#define scale orig_scale
#define subtract_window orig_subtract_window
#define clip_order orig_clip_order
#define compare_clip_order orig_compare_clip_order
#define reduce_clip_rects orig_reduce_clip_rects
#define scale_clip_rects orig_scale_clip_rects
#define get_region_clip orig_get_region_clip
#define get_client_clip orig_get_client_clip
#include "client_orig.inc"
#undef scale
#undef subtract_window
#undef clip_order
#undef compare_clip_order
#undef reduce_clip_rects
#undef scale_clip_rects
#undef get_region_clip
#undef get_client_clip
#include "client_new.inc"

/* app/jni/server.h and the display server functions used */
#define MAX_CLIENT_BUFFERS 3
#define ADISP_WIN_GLASS    0x100
struct client_buffer { void *ahb; unsigned int tex; uint64_t last_used; };
struct client { int dummy; };
struct client_surf
{
    struct client_surf *next;
    struct client  *client;
    uint32_t        id;
    uint32_t        toplevel;
    uint32_t        flags;
    struct adisp_rect rect;
    uint32_t        clip_count;
    struct adisp_rect *clip;
    uint32_t        clip_size;
    struct client_buffer buffers[MAX_CLIENT_BUFFERS];
    int             displayed;
    int             pending;
    int             retired[MAX_CLIENT_BUFFERS];
    int             retired_count;
};
struct window { uint32_t hwnd, flags; struct adisp_rect visible; };
static struct { struct client_surf *client_surfs; uint64_t frame_serial; unsigned int stat_frames; } scene;
static struct { int linear_filter; } config;
typedef int GLint;
enum { GL_LINEAR, GL_NEAREST, GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_TEXTURE_MAG_FILTER };
enum { MODE_RGBA = 1, MODE_PERPIXEL = 2, MODE_GLASS = 4 };
static int loc_mode, loc_alpha;
static void glBindTexture( int t, unsigned int tex ) {}
static void glTexParameteri( int t, int p, int v ) {}
static void glUniform1i( int l, int v ) {}
static void glUniform1f( int l, float v ) {}
static void client_surf_retire( struct client_surf *s, int i, bool b ) {}
static bool import_client_buffer( struct client_buffer *b ) { return true; }
static void scene_mark_dirty(void) {}
static struct client_surf *find_client_surf( struct client *client, uint32_t id )
{
    struct client_surf *surf;
    for (surf = scene.client_surfs; surf; surf = surf->next) if (surf->id == id) return surf;
    return NULL;
}

/* the screen of the display server: 1 where the GPU surface was drawn */
#define SCREEN_W 3000
#define SCREEN_H 1800
static unsigned char screen[SCREEN_H][SCREEN_W], expected[SCREEN_H][SCREEN_W];

static void fill( unsigned char (*dst)[SCREEN_W], int l, int t, int r, int b, unsigned char val, const struct adisp_rect *bound )
{
    int y;
    if (l < bound->left) l = bound->left;
    if (t < bound->top) t = bound->top;
    if (r > bound->right) r = bound->right;
    if (b > bound->bottom) b = bound->bottom;
    for (y = t; y < b; y++) if (r > l) memset( dst[y] + l, val, r - l );
}
static int quads, out_of_screen;
static void draw_quad_uv( int x, int y, int w, int h, float u0, float v0, float u1, float v1 )
{
    int i, j;
    quads++;
    for (j = y; j < y + h; j++)
        for (i = x; i < x + w; i++)
        {
            if (i < 0 || j < 0 || i >= SCREEN_W || j >= SCREEN_H) { out_of_screen++; continue; }
            screen[j][i] = 1;
        }
}

#include "server.inc"

static int failures, checks;
static char name[256];
#define check( cond, ... ) do { checks++; if (!(cond)) { failures++; printf( "FAIL %s: ", name ); printf( __VA_ARGS__ ); printf( "\n" ); } } while (0)

static unsigned int rand_state = 1;
static int rnd( int n ) { rand_state = rand_state * 1103515245 + 12345; return (rand_state >> 8) % n; }

/* the toplevel, a popup: its window rect is its visible and client rect */
static HWND toplevel;
static HWND children[600];
static RECT child_rects[600];  /* in the coordinates of the toplevel */
static int child_count;
#define TOP_X 40
#define TOP_Y 30

static void add_child( HWND parent, int l, int t, int r, int b )
{
    HWND hwnd = CreateWindowA( "BUTTON", "", WS_CHILD | WS_VISIBLE, l, t, r - l, b - t, parent, 0, 0, 0 );
    children[child_count] = hwnd;
    SetRect( &child_rects[child_count], l, t, r, b );
    child_count++;
}

static void clear_children(void)
{
    while (child_count) DestroyWindow( children[--child_count] );
}

static int sc( int v, int vfrom, int mfrom, int num, int den )
{
    return mfrom + (int)((long long)(v - vfrom) * num / den);
}

struct result { UINT count; struct adisp_rect rects[ADISP_MAX_CLIP_RECTS]; };

/* the display server draws the surface with that clip, compare with the expected pixels:
 * the presented rect, scaled to the monitor, minus the child windows (scaled the same way),
 * returns the GPU pixels drawn where the window surface should show */
static long long composite( const struct client_surface *cs, const struct result *res, BOOL check_exact,
                            long long *gpu_pixels )
{
    static struct client client;
    static struct client_surf surf;
    static struct adisp_client_clip *msg;
    const RECT *v = &cs->virtual_rect, *m = &cs->monitor_rect, *p = &cs->presented_rect;
    int vw = v->right - v->left, vh = v->bottom - v->top, mw = m->right - m->left, mh = m->bottom - m->top;
    struct window win;
    struct adisp_rect top;
    long long wrong = 0, missing = 0, drawn = 0;
    int x, y, i;
    UINT n = res->count == ADISP_CLIP_NONE ? 0 : res->count;

    if (!msg) msg = malloc( ADISP_MAX_MSG_SIZE );
    memset( &surf, 0, sizeof(surf) );
    surf.id = 1;
    surf.toplevel = 0x10;
    surf.flags = ADISP_CLIENT_VISIBLE;
    surf.displayed = 0;
    surf.pending = -1;
    surf.buffers[0].ahb = (void *)1;
    surf.clip_count = ADISP_CLIP_NONE;
    surf.rect = (struct adisp_rect){ m->left, m->top, m->right, m->bottom };
    scene.client_surfs = &surf;

    msg->hdr.size = offsetof( struct adisp_client_clip, rects[n] );
    msg->id = 1;
    msg->count = res->count;
    memcpy( msg->rects, res->rects, n * sizeof(res->rects[0]) );
    req_client_clip( &client, msg, msg->hdr.size );

    /* the toplevel on the screen of the server, its size in monitor pixels */
    top = (struct adisp_rect){ 100, 60, 100 + sc( 1200, 0, 0, mw, vw ), 60 + sc( 700, 0, 0, mh, vh ) };
    win = (struct window){ 0x10, 0, top };
    memset( screen, 0, sizeof(screen) );
    quads = out_of_screen = 0;
    draw_client_surfaces( &win, 1.0f );
    free( surf.clip );

    /* expected: the presented rect scaled to the monitor, cut by the toplevel, minus the children */
    memset( expected, 0, sizeof(expected) );
    fill( expected, top.left + sc( p->left, v->left, m->left, mw, vw ), top.top + sc( p->top, v->top, m->top, mh, vh ),
          top.left + sc( p->right, v->left, m->left, mw, vw ), top.top + sc( p->bottom, v->top, m->top, mh, vh ), 1, &top );
    for (i = 0; i < child_count; i++)
        fill( expected, top.left + sc( child_rects[i].left, v->left, m->left, mw, vw ),
              top.top + sc( child_rects[i].top, v->top, m->top, mh, vh ),
              top.left + sc( child_rects[i].right, v->left, m->left, mw, vw ),
              top.top + sc( child_rects[i].bottom, v->top, m->top, mh, vh ), 0, &top );
    for (y = 0; y < SCREEN_H; y++)
        for (x = 0; x < SCREEN_W; x++)
        {
            if (screen[y][x]) drawn++;
            if (screen[y][x] && !expected[y][x]) wrong++;
            if (!screen[y][x] && expected[y][x]) missing++;
        }
    if (check_exact)
    {
        check( !wrong, "%lld GPU pixels drawn over what should show the window surface", wrong );
        check( !missing, "%lld GPU pixels missing in the presented part", missing );
        check( !out_of_screen, "drawn outside of the screen" );
    }
    if (gpu_pixels) *gpu_pixels = drawn;
    return wrong;
}

static void compute( UINT (*func)( struct android_client_surface *, struct adisp_rect *, UINT ),
                     struct android_client_surface *surface, struct result *res )
{
    memset( res->rects, 0xcc, sizeof(res->rects) );
    res->count = func( surface, res->rects, ADISP_MAX_CLIP_RECTS );
}

static BOOL same_result( const struct result *a, const struct result *b )
{
    UINT n = a->count == ADISP_CLIP_NONE ? 0 : a->count;
    return a->count == b->count && !memcmp( a->rects, b->rects, n * sizeof(a->rects[0]) );
}

static const char *wine_dbgstr_rect_( const RECT *r );
static long long old_wrong_total, new_wrong_total;
static int partial_cases, full_cases;

/* one surface on the toplevel, presented rect in client coordinates (NULL: all of it) */
static void run( const char *layout, const RECT *presented, int num, int den )
{
    static struct result res_orig, res_new;
    struct android_client_surface surface;
    struct client_surface *cs = &surface.base;
    long long wrong_old, wrong_new, gpu_new;

    memset( &surface, 0, sizeof(surface) );
    cs->hwnd = cs->toplevel = toplevel;
    SetRect( &cs->virtual_rect, 0, 0, 1200, 700 );
    SetRect( &cs->monitor_rect, 0, 0, 1200 * num / den, 700 * num / den );
    if (presented) IntersectRect( &cs->presented_rect, presented, &cs->virtual_rect );
    else cs->presented_rect = cs->virtual_rect;

    snprintf( name, sizeof(name), "%s, presented %s, scale %d/%d", layout,
              presented ? wine_dbgstr_rect_( presented ) : "all", num, den );

    compute( orig_get_client_clip, &surface, &res_orig );
    compute( get_client_clip, &surface, &res_new );

    if (!presented)
    {
        full_cases++;
        /* an ordinary game: the same clip as before */
        check( same_result( &res_orig, &res_new ), "clip changed: %u -> %u rects", res_orig.count, res_new.count );
        check( res_new.count == (child_count ? res_new.count : ADISP_CLIP_NONE), "no children: got %u", res_new.count );
        composite( cs, &res_new, TRUE, NULL );
        return;
    }
    partial_cases++;
    check( res_new.count != ADISP_CLIP_NONE, "the surface is not clipped to the presented part" );
    check( res_new.count <= ADISP_MAX_CLIP_RECTS, "%u rects", res_new.count );
    if (IsRectEmpty( &cs->presented_rect )) check( res_new.count == 0, "nothing presented: got %u rects", res_new.count );
    wrong_new = composite( cs, &res_new, TRUE, &gpu_new );
    wrong_old = composite( cs, &res_orig, FALSE, NULL );
    old_wrong_total += wrong_old;
    new_wrong_total += wrong_new;
    printf( "%-70s old: %4u rects, %8lld GPU pixels over GDI; new: %4u rects, %8lld\n", name,
            res_orig.count, wrong_old, res_new.count, wrong_new );
}

static const char *wine_dbgstr_rect_( const RECT *r )
{
    static char buf[4][64];
    static int i;
    i = (i + 1) % 4;
    snprintf( buf[i], sizeof(buf[i]), "(%ld,%ld)-(%ld,%ld)", r->left, r->top, r->right, r->bottom );
    return buf[i];
}

/* MikuMikuDance like: the preview at (393,25)-(1137,444), the panels left of it and below
 * it with their buttons, the timeline (GDI) at the bottom left */
static void mmd_layout(void)
{
    int x, y;

    for (y = 30; y < 430; y += 24)
        for (x = 8; x < 380; x += 62) add_child( toplevel, x, y, x + 58, y + 20 );
    for (x = 393; x < 1130; x += 52) add_child( toplevel, x, 452, x + 48, 472 );
    for (y = 480; y < 690; y += 26)
    {
        add_child( toplevel, 760, y, 860, y + 22 );
        add_child( toplevel, 870, y, 1000, y + 22 );
    }
    add_child( toplevel, 1150, 25, 1190, 444 );  /* a scroll bar right of the preview */
    add_child( toplevel, 1000, 400, 1137, 444 ); /* a panel over the corner of the preview */
}

static void random_layout( int count )
{
    while (count--)
    {
        int l = rnd( 1200 ), t = rnd( 700 );
        add_child( toplevel, l, t, l + 1 + rnd( 200 ), t + 1 + rnd( 120 ) );
    }
}

static void run_presents( const char *layout )
{
    static const RECT presented[] =
    {
        { 393, 25, 1137, 444 },   /* MikuMikuDance */
        { 0, 0, 1200, 699 },      /* one line less */
        { 1, 0, 1200, 700 },
        { 0, 0, 600, 700 },
        { 100, 100, 101, 101 },   /* one pixel */
        { -50, -50, 300, 300 },   /* partly outside of the window */
        { 1100, 600, 1400, 900 },
        { 0, 0, 0, 0 },           /* nothing presented (GDI present) */
    };
    static const int scales[][2] = { { 1, 1 }, { 3, 2 }, { 3, 4 }, { 7, 3 } };
    unsigned int i, j;

    for (j = 0; j < ARRAY_SIZE(scales); j++)
    {
        run( layout, NULL, scales[j][0], scales[j][1] );
        for (i = 0; i < ARRAY_SIZE(presented); i++) run( layout, &presented[i], scales[j][0], scales[j][1] );
    }
    for (i = 0; i < 6; i++)
    {
        RECT r;
        int l = rnd( 1200 ), t = rnd( 700 );
        SetRect( &r, l, t, l + 1 + rnd( 800 ), t + 1 + rnd( 500 ) );
        run( layout, &r, 1, 1 );
        run( layout, &r, 3, 2 );
    }
}

int main(void)
{
    int i;

    toplevel = CreateWindowA( "STATIC", "toplevel", WS_POPUP | WS_VISIBLE | WS_CLIPCHILDREN,
                              TOP_X, TOP_Y, 1200, 700, 0, 0, 0, 0 );

    run_presents( "no children" );
    mmd_layout();
    run_presents( "mmd" );
    clear_children();
    for (i = 0; i < 6; i++)
    {
        char layout[32];
        random_layout( 5 + rnd( 60 ) );
        snprintf( layout, sizeof(layout), "random %d", i );
        run_presents( layout );
        clear_children();
    }
    DestroyWindow( toplevel );

    printf( "%d whole window cases, %d partial cases; GPU pixels drawn over the GDI part: old %lld, new %lld\n",
            full_cases, partial_cases, old_wrong_total, new_wrong_total );
    printf( "%d checks, %d failures\n", checks, failures );
    return failures ? 1 : 0;
}
