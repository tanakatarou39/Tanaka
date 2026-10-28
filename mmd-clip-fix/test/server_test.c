/* Builds and runs on Linux: the request handler (app/jni/server.c) and the drawing of the
 * client surfaces (app/jni/render.c) of the display server, extracted unchanged into
 * server_clip.inc, with the clips region_test computed with the GDI of Wine. Checks that
 * nothing of the GPU surface is drawn over the child windows. */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#define ADISP_CLIP_NONE      0xffffffff
#define ADISP_MAX_CLIP_RECTS 2048
#define ADISP_MAX_MSG_SIZE   (128 * 1024)
#define MAX_CLIENT_BUFFERS   3
#define ADISP_CLIENT_VISIBLE 1
#define ADISP_WIN_GLASS      0x100

struct adisp_rect { int32_t left, top, right, bottom; };
struct adisp_header { uint32_t type, size; };
struct adisp_client_clip
{
    struct adisp_header hdr;
    uint32_t id;
    uint32_t count;           /* entries in rects (0: all covered), or ADISP_CLIP_NONE (nothing covered) */
    struct adisp_rect rects[1];
};
_Static_assert( offsetof( struct adisp_client_clip, rects[ADISP_MAX_CLIP_RECTS] ) <= ADISP_MAX_MSG_SIZE, "too large" );

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
    struct adisp_rect *clip;   /* clip_size allocated entries */
    uint32_t        clip_size;
    struct client_buffer buffers[MAX_CLIENT_BUFFERS];
    int             displayed;
    int             pending;
    int             retired[MAX_CLIENT_BUFFERS];
    int             retired_count;
};
struct window { uint32_t hwnd, flags; struct adisp_rect visible; };

/* stubs of the display server */
static struct { struct client_surf *client_surfs; uint64_t frame_serial; unsigned int stat_frames; } scene;
static struct { int linear_filter; } config;
typedef int GLint;
enum { GL_LINEAR, GL_NEAREST, GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_TEXTURE_MAG_FILTER };
enum { MODE_RGBA = 1, MODE_PERPIXEL = 2, MODE_GLASS = 4 };
static int loc_mode, loc_alpha, dirty;
static void glBindTexture( int t, unsigned int tex ) {}
static void glTexParameteri( int t, int p, int v ) {}
static void glUniform1i( int l, int v ) {}
static void glUniform1f( int l, float v ) {}
static void client_surf_retire( struct client_surf *s, int i, bool b ) {}
static bool import_client_buffer( struct client_buffer *b ) { return true; }
static void scene_mark_dirty(void) { dirty++; }
static struct client_surf *find_client_surf( struct client *client, uint32_t id )
{
    struct client_surf *surf;
    for (surf = scene.client_surfs; surf; surf = surf->next) if (surf->id == id) return surf;
    return NULL;
}

static struct adisp_rect quads[20000];
static int quad_count;
static void draw_quad_uv( int x, int y, int w, int h, float u0, float v0, float u1, float v1 )
{
    quads[quad_count++] = (struct adisp_rect){ x, y, x + w, y + h };
}

#include "server_clip.inc"

static int failures, checks;
static const char *name;
#define check( cond, ... ) do { checks++; if (!(cond)) { failures++; printf( "FAIL %s: ", name ); printf( __VA_ARGS__ ); printf( "\n" ); } } while (0)

static int intersects( const struct adisp_rect *a, const struct adisp_rect *b )
{
    return a->left < b->right && b->left < a->right && a->top < b->bottom && b->top < a->bottom;
}

static struct client client;
static struct client_surf surf;
static uint32_t msg_id = 1;

static void send_clip( uint32_t count, const struct adisp_rect *rects, size_t size )
{
    struct adisp_client_clip *msg = malloc( ADISP_MAX_MSG_SIZE );
    uint32_t n = count == ADISP_CLIP_NONE ? 0 : count;

    msg->hdr.size = size;
    msg->id = msg_id;
    msg->count = count;
    if (n <= (ADISP_MAX_MSG_SIZE - offsetof( struct adisp_client_clip, rects )) / sizeof(*rects))
        memcpy( msg->rects, rects, n * sizeof(*rects) );
    req_client_clip( &client, msg, size );
    free( msg );
}

static void test_requests(void)
{
    struct adisp_rect rects[ADISP_MAX_CLIP_RECTS + 1] = {{0}};
    int i;

    name = "requests";
    for (i = 0; i <= ADISP_MAX_CLIP_RECTS; i++) rects[i] = (struct adisp_rect){ i, 0, i + 1, 1 };

    send_clip( ADISP_CLIP_NONE, NULL, offsetof( struct adisp_client_clip, rects ) );
    check( surf.clip_count == ADISP_CLIP_NONE, "got %u", surf.clip_count );
    send_clip( 0, NULL, offsetof( struct adisp_client_clip, rects ) );
    check( surf.clip_count == 0, "got %u", surf.clip_count );
    send_clip( 3, rects, offsetof( struct adisp_client_clip, rects[3] ) );
    check( surf.clip_count == 3 && surf.clip_size >= 3 && surf.clip[2].left == 2, "got %u", surf.clip_count );
    /* truncated message: ignored */
    send_clip( 5, rects, offsetof( struct adisp_client_clip, rects[4] ) );
    check( surf.clip_count == 3, "got %u", surf.clip_count );
    /* at the limit */
    send_clip( ADISP_MAX_CLIP_RECTS, rects, offsetof( struct adisp_client_clip, rects[ADISP_MAX_CLIP_RECTS] ) );
    check( surf.clip_count == ADISP_MAX_CLIP_RECTS && surf.clip[ADISP_MAX_CLIP_RECTS - 1].left == ADISP_MAX_CLIP_RECTS - 1,
           "got %u", surf.clip_count );
    /* above the limit: ignored */
    send_clip( ADISP_MAX_CLIP_RECTS + 1, rects, offsetof( struct adisp_client_clip, rects[ADISP_MAX_CLIP_RECTS + 1] ) );
    check( surf.clip_count == ADISP_MAX_CLIP_RECTS, "got %u", surf.clip_count );
    send_clip( 0x7fffffff, rects, ADISP_MAX_MSG_SIZE );
    check( surf.clip_count == ADISP_MAX_CLIP_RECTS, "got %u", surf.clip_count );
    /* smaller again: the buffer is kept */
    send_clip( 2, rects + 5, offsetof( struct adisp_client_clip, rects[2] ) );
    check( surf.clip_count == 2 && surf.clip_size == ADISP_MAX_CLIP_RECTS && surf.clip[1].left == 6, "got %u", surf.clip_count );
    /* unknown surface */
    msg_id = 2;
    send_clip( 1, rects, offsetof( struct adisp_client_clip, rects[1] ) );
    msg_id = 1;
    check( surf.clip_count == 2, "got %u", surf.clip_count );
}

int main( int argc, char **argv )
{
    static struct adisp_rect children[4000], clip[20000];
    FILE *f = fopen( argc > 1 ? argv[1] : "clips.txt", "r" );
    char line[512], case_name[256];
    struct window win = { 0x10, 0 };
    int child_count, i, j, cases = 0;
    struct adisp_rect s;
    uint32_t count;

    surf.id = 1;
    surf.toplevel = 0x10;
    surf.flags = ADISP_CLIENT_VISIBLE;
    surf.displayed = 0;
    surf.pending = -1;
    surf.buffers[0].ahb = (void *)1;
    surf.clip_count = ADISP_CLIP_NONE;
    scene.client_surfs = &surf;

    test_requests();

    while (fgets( line, sizeof(line), f ))
    {
        long long drawn = 0, expected = 0;
        struct adisp_rect top;

        if (sscanf( line, "case %255[^\n]", case_name ) != 1) continue;
        name = case_name;
        if (fscanf( f, "surface %d %d %d %d\n", &s.left, &s.top, &s.right, &s.bottom ) != 4) break;
        if (fscanf( f, "children %d\n", &child_count ) != 1) break;
        for (i = 0; i < child_count; i++)
            if (fscanf( f, "%d %d %d %d\n", &children[i].left, &children[i].top, &children[i].right, &children[i].bottom ) != 4) break;
        if (fscanf( f, "clip %u\n", &count ) != 1) break;
        for (i = 0; count != ADISP_CLIP_NONE && i < count; i++)
            if (fscanf( f, "%d %d %d %d\n", &clip[i].left, &clip[i].top, &clip[i].right, &clip[i].bottom ) != 4) break;

        /* the old client: no clip at all above 64 rects */
        if (getenv( "OLD_LIMIT" ) && count != ADISP_CLIP_NONE && count > 64) count = ADISP_CLIP_NONE;

        /* the toplevel on the screen, cutting the surface on the right and bottom */
        win.visible = (struct adisp_rect){ 100, 50, 100 + s.right - 40, 50 + s.bottom - 30 };
        surf.rect = s;
        send_clip( count, clip, offsetof( struct adisp_client_clip, rects[count == ADISP_CLIP_NONE ? 0 : count] ) );
        check( surf.clip_count == count, "server kept %u of %u", surf.clip_count, count );

        quad_count = 0;
        draw_client_surfaces( &win, 1.0f );

        top = (struct adisp_rect){ win.visible.left + (s.left > 0 ? s.left : 0), win.visible.top + (s.top > 0 ? s.top : 0),
                                   win.visible.right, win.visible.bottom };
        for (i = 0; i < quad_count; i++)
        {
            const struct adisp_rect *q = &quads[i];

            check( q->left >= top.left && q->top >= top.top && q->right <= top.right && q->bottom <= top.bottom,
                   "quad %d outside of the surface and toplevel", i );
            for (j = 0; j < child_count; j++)
            {
                struct adisp_rect c = children[j];
                c.left += win.visible.left; c.right += win.visible.left;
                c.top += win.visible.top; c.bottom += win.visible.top;
                if (c.right > c.left && c.bottom > c.top && intersects( q, &c ))
                {
                    check( 0, "quad %d (%d,%d)-(%d,%d) over child %d", i, q->left, q->top, q->right, q->bottom, j );
                    break;
                }
            }
            for (j = 0; j < i; j++) if (intersects( q, &quads[j] )) { check( 0, "quads %d and %d overlap", i, j ); break; }
            drawn += (long long)(q->right - q->left) * (q->bottom - q->top);
        }
        /* everything of the clip inside the toplevel is drawn */
        for (i = 0; i < (count == ADISP_CLIP_NONE ? 1 : (int)count); i++)
        {
            struct adisp_rect r = count == ADISP_CLIP_NONE ? s : clip[i];
            int l = r.left + win.visible.left, t = r.top + win.visible.top, rr = r.right + win.visible.left, b = r.bottom + win.visible.top;
            if (l < top.left) l = top.left;
            if (t < top.top) t = top.top;
            if (rr > top.right) rr = top.right;
            if (b > top.bottom) b = top.bottom;
            if (rr > l && b > t) expected += (long long)(rr - l) * (b - t);
        }
        check( drawn == expected, "drew %lld pixels, expected %lld", drawn, expected );
        if (count == ADISP_CLIP_NONE) check( quad_count == 1, "%d quads without clip", quad_count );
        if (count == 0) check( quad_count == 0, "%d quads when all covered", quad_count );
        cases++;
    }
    fclose( f );
    free( surf.clip );
    printf( "server_test: %d cases, %d checks, %d failures\n", cases, checks, failures );
    return failures != 0;
}
