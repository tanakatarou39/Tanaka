/* Builds with mingw and runs on Wine: computes the visible region of a surface covered by
 * child windows with the GDI region functions (CreateRectRgn, CombineRgn(RGN_DIFF),
 * GetRegionData), passes it to the clip code of the patch (wineandroid.drv/client.c,
 * extracted unchanged into client_clip.inc) and checks the result.
 * The clips are written to a file for server_test (the display server side). */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <windows.h>

#define ADISP_CLIP_NONE      0xffffffff
#define ADISP_MAX_CLIP_RECTS 2048
struct adisp_rect { int32_t left, top, right, bottom; };

#define ARRAY_SIZE( a ) (sizeof(a) / sizeof((a)[0]))
#define NtGdiGetRegionData( rgn, size, data ) GetRegionData( rgn, size, data )
static int warnings;
#define WARN( ... ) (warnings++)

/* the scale() of wineandroid.drv isn't part of the excerpt: test a rounding and a truncating one */
static int scale_round;
static int scale( int value, int num, int den )
{
    if (scale_round) return MulDiv( value, num, den );
    return (int)((long long)value * num / den);
}

#include "client_clip.inc"

static int failures, checks;
#define check( cond, ... ) do { checks++; if (!(cond)) { failures++; printf( "FAIL %s: ", name ); printf( __VA_ARGS__ ); printf( "\n" ); } } while (0)

static const char *name;
static FILE *dump;

static RECT children[4000];
static int child_count;

static unsigned int rand_state;
static int rnd( int n ) { rand_state = rand_state * 1103515245 + 12345; return (rand_state >> 8) % n; }

static void add_child( int l, int t, int r, int b ) { SetRect( &children[child_count++], l, t, r, b ); }

static int intersects( const struct adisp_rect *a, const struct adisp_rect *b )
{
    return a->left < b->right && b->left < a->right && a->top < b->bottom && b->top < a->bottom;
}

static long long area( const struct adisp_rect *r ) { return (long long)(r->right - r->left) * (r->bottom - r->top); }

/* the old code: nothing clipped (ADISP_CLIP_NONE) with more than 64 rects */
static UINT old_count( HRGN rgn, BOOL covered )
{
    char buffer[sizeof(RGNDATAHEADER) + 64 * sizeof(RECT)];
    RGNDATA *data = (RGNDATA *)buffer;
    if (covered && GetRegionData( rgn, sizeof(buffer), data ) && data->rdh.nCount <= 64) return data->rdh.nCount;
    return ADISP_CLIP_NONE;
}

static void run( const char *case_name, const RECT *vrect, const RECT *mrect, UINT max, int rounding )
{
    static struct adisp_rect scaled[4000];
    struct adisp_rect *rects, *all;
    char full_name[256];
    int vw = vrect->right - vrect->left, vh = vrect->bottom - vrect->top;
    int mw = mrect->right - mrect->left, mh = mrect->bottom - mrect->top;
    UINT count, region_count, all_count, i, j;
    BOOL covered = FALSE;
    RGNDATA *data;
    HRGN rgn, tmp;
    DWORD size;
    long long sum, all_sum;

    sprintf( full_name, "%s max=%u %dx%d->%dx%d %s", case_name, max, vw, vh, mw, mh, rounding ? "round" : "trunc" );
    name = full_name;
    scale_round = rounding;

    rgn = CreateRectRgn( vrect->left, vrect->top, vrect->right, vrect->bottom );
    for (i = 0; i < child_count; i++)
    {
        if (IsRectEmpty( &children[i] )) continue;
        tmp = CreateRectRgnIndirect( &children[i] );
        covered |= CombineRgn( rgn, rgn, tmp, RGN_DIFF ) != ERROR;
        DeleteObject( tmp );
    }
    size = GetRegionData( rgn, 0, NULL );
    data = malloc( size );
    GetRegionData( rgn, size, data );
    region_count = data->rdh.nCount;
    rects = malloc( (region_count + 1) * sizeof(*rects) );
    all = malloc( (region_count + 1) * sizeof(*all) );

    /* the children and the region in the monitor coordinates, scaled like the patch does */
    for (i = 0; i < child_count; i++)
    {
        scaled[i].left   = mrect->left + scale( children[i].left - vrect->left, mw, vw );
        scaled[i].top    = mrect->top + scale( children[i].top - vrect->top, mh, vh );
        scaled[i].right  = mrect->left + scale( children[i].right - vrect->left, mw, vw );
        scaled[i].bottom = mrect->top + scale( children[i].bottom - vrect->top, mh, vh );
    }
    all_count = covered ? scale_clip_rects( (const RECT *)data->Buffer, region_count, vrect, mrect, all ) : 0;
    for (i = 0, all_sum = 0; i < all_count; i++) all_sum += area( &all[i] );

    memset( rects, 0xcc, (region_count + 1) * sizeof(*rects) );
    count = get_region_clip( rgn, covered, vrect, mrect, rects, max );

    if (count == ADISP_CLIP_NONE) printf( "%-48s region %4u rects, old: %s, new: NONE\n", name, region_count,
            old_count( rgn, covered ) == ADISP_CLIP_NONE ? "NONE (not clipped)" : "clipped" );
    else printf( "%-48s region %4u rects, old: %s, new: %u rects\n", name, region_count,
            old_count( rgn, covered ) == ADISP_CLIP_NONE ? "NONE (not clipped)" : "clipped",
            count );

    if (!covered)
        check( count == ADISP_CLIP_NONE, "got %u, expected ADISP_CLIP_NONE", count );
    else
    {
        check( count != ADISP_CLIP_NONE, "too complex must not mean not clipped" );
        check( count <= max, "%u > max %u", count, max );
        check( count == (all_count < max ? all_count : max), "got %u, expected %u", count, all_count < max ? all_count : max );
        for (i = 0, sum = 0; count != ADISP_CLIP_NONE && i < count; i++)
        {
            const struct adisp_rect *r = &rects[i];

            check( r->left < r->right && r->top < r->bottom, "rect %u empty", i );
            check( r->left >= mrect->left && r->top >= mrect->top && r->right <= mrect->right && r->bottom <= mrect->bottom,
                   "rect %u outside the surface", i );
            for (j = 0; j < child_count; j++)
                if (!IsRectEmpty( &children[j] ) && intersects( r, &scaled[j] ))
                {
                    check( 0, "rect %u (%d,%d)-(%d,%d) over child %u (%d,%d)-(%d,%d)", i, r->left, r->top, r->right, r->bottom,
                           j, scaled[j].left, scaled[j].top, scaled[j].right, scaled[j].bottom );
                    break;
                }
            for (j = 0; j < i; j++) if (intersects( r, &rects[j] )) { check( 0, "rects %u and %u overlap", i, j ); break; }
            /* kept in the band order of the region */
            if (i) check( rects[i - 1].top < r->top || (rects[i - 1].top == r->top && rects[i - 1].left < r->left),
                          "rect %u out of order", i );
            sum += area( r );
        }
        if (all_count <= max) check( sum == all_sum, "area %lld, expected %lld", sum, all_sum );
        else
        {
            /* only the smallest parts are dropped */
            long long min_kept = -1, max_dropped = 0;
            for (i = 0; i < count; i++) if (min_kept < 0 || area( &rects[i] ) < min_kept) min_kept = area( &rects[i] );
            for (i = 0, j = 0; i < all_count; i++)
            {
                if (j < count && !memcmp( &all[i], &rects[j], sizeof(rects[j]) )) j++;
                else if (area( &all[i] ) > max_dropped) max_dropped = area( &all[i] );
            }
            check( j == count, "kept rects are not a subsequence of the region" );
            check( min_kept >= max_dropped, "dropped a part of %lld, kept one of %lld", max_dropped, min_kept );
            printf( "%-48s kept %.1f%% of the visible area\n", "", 100.0 * sum / all_sum );
        }
        /* with the same size, the parts are exactly the GDI region */
        if (mw == vw && mh == vh && all_count <= max)
        {
            const RECT *r = (const RECT *)data->Buffer;
            check( count == region_count, "%u rects, region has %u", count, region_count );
            for (i = 0; i < count && i < region_count; i++)
                check( rects[i].left == r[i].left - vrect->left + mrect->left && rects[i].top == r[i].top - vrect->top + mrect->top &&
                       rects[i].right == r[i].right - vrect->left + mrect->left && rects[i].bottom == r[i].bottom - vrect->top + mrect->top,
                       "rect %u differs from the region", i );
        }
    }

    /* for server_test */
    fprintf( dump, "case %s\n", name );
    fprintf( dump, "surface %d %d %d %d\n", (int)mrect->left, (int)mrect->top, (int)mrect->right, (int)mrect->bottom );
    fprintf( dump, "children %d\n", child_count );
    for (i = 0; i < child_count; i++)
        fprintf( dump, "%d %d %d %d\n", scaled[i].left, scaled[i].top, scaled[i].right, scaled[i].bottom );
    fprintf( dump, "clip %u\n", count );
    for (i = 0; count != ADISP_CLIP_NONE && i < count; i++)
        fprintf( dump, "%d %d %d %d\n", rects[i].left, rects[i].top, rects[i].right, rects[i].bottom );

    free( rects );
    free( all );
    free( data );
    DeleteObject( rgn );
}

/* the 3D view of MikuMikuDance, under the many controls of its panels */
static void mmd_layout( int w, int h, int controls, unsigned int seed )
{
    int i;

    rand_state = seed;
    child_count = 0;
    for (i = 0; i < controls; i++)
    {
        int cw = 14 + rnd( 60 ), ch = 14 + rnd( 10 ), x, y;
        switch (rnd( 4 ))
        {
        case 0: /* bottom panel */
            x = rnd( w - cw ); y = h - 220 + rnd( 220 - ch ); break;
        case 1: /* right panel */
            x = w - 300 + rnd( 300 - cw ); y = rnd( h - ch ); break;
        case 2: /* left panel */
            x = rnd( 260 - cw ); y = rnd( h - ch ); break;
        default: /* anywhere: labels and buttons over the view */
            x = rnd( w - cw ); y = rnd( h - ch ); break;
        }
        add_child( x, y, x + cw, y + ch );
    }
}

/* MikuMikuDance: rows of controls in the panels around and over the 3D view */
static void mmd_panel_layout( int w, int h, unsigned int seed )
{
    int x, y, row_h;

    rand_state = seed;
    child_count = 0;
    /* bottom panel: frame, interpolation, bone and light controls */
    for (y = h - 200; y < h - 20; y += row_h + 4 + rnd( 4 ))
    {
        row_h = 18 + rnd( 4 );
        for (x = 4 + rnd( 8 ); x < w - 60; x += 6 + rnd( 30 ))
        {
            int cw = 16 + rnd( 70 );
            add_child( x, y + rnd( 3 ), x + cw, y + row_h );
            x += cw;
        }
    }
    /* right panel: model and accessory manipulation */
    for (y = 4; y < h - 210; y += row_h + 3 + rnd( 6 ))
    {
        row_h = 18 + rnd( 6 );
        for (x = w - 260 + rnd( 6 ); x < w - 30; x += 4 + rnd( 20 ))
        {
            int cw = 14 + rnd( 50 );
            add_child( x, y + rnd( 4 ), x + cw, y + row_h );
            x += cw;
        }
    }
    /* view buttons over the 3D view */
    for (x = 300; x < w - 300; x += 30 + rnd( 40 )) add_child( x, 4 + rnd( 6 ), x + 20 + rnd( 20 ), 26 + rnd( 4 ) );
}

static void run_scales( const char *case_name, int w, int h, UINT max )
{
    static const struct { int w, h; } sizes[] = { {0, 0}, {-2, -2}, {3, 3}, {1366, 768}, {1000, 333} };
    RECT vrect, mrect;
    int i, r;

    SetRect( &vrect, 0, 0, w, h );
    for (i = 0; i < ARRAY_SIZE(sizes); i++)
    {
        int mw = sizes[i].w > 0 ? sizes[i].w : sizes[i].w == 0 ? w : w / 2;
        int mh = sizes[i].h > 0 ? sizes[i].h : sizes[i].h == 0 ? h : h / 2;
        if (sizes[i].w == 3) { mw = w * 3 / 2; mh = h * 3 / 2; }
        SetRect( &mrect, 7, 31, 7 + mw, 31 + mh );
        for (r = 0; r < 2; r++) run( case_name, &vrect, &mrect, max, r );
    }
}

int main( int argc, char **argv )
{
    static const UINT maxes[] = { 64, 512, ADISP_MAX_CLIP_RECTS };
    RECT vrect, mrect;
    UINT i, count;

    dump = fopen( argc > 1 ? argv[1] : "clips.txt", "w" );

    /* MikuMikuDance like: 629 to 898 rects were seen */
    for (i = 0; i < ARRAY_SIZE(maxes); i++)
    {
        mmd_panel_layout( 1280, 720, 5 );
        run_scales( "mmd panels", 1280, 720, maxes[i] );
        mmd_panel_layout( 1600, 900, 6 );
        run_scales( "mmd panels", 1600, 900, maxes[i] );
        mmd_layout( 1280, 720, 300, 1 );
        run_scales( "mmd 300 controls", 1280, 720, maxes[i] );
        mmd_layout( 1920, 1080, 450, 2 );
        run_scales( "mmd 450 controls", 1920, 1080, maxes[i] );
    }
    /* beyond the protocol limit */
    mmd_layout( 1920, 1080, 2500, 3 );
    run_scales( "2500 controls", 1920, 1080, ADISP_MAX_CLIP_RECTS );

    /* at the limit and one above */
    mmd_panel_layout( 1280, 720, 5 );
    SetRect( &vrect, 0, 0, 1280, 720 );
    mrect = vrect;
    run( "mmd (count)", &vrect, &mrect, 4096, 0 );
    {
        static struct adisp_rect tmp[16384];
        HRGN rgn = CreateRectRgnIndirect( &vrect ), c;
        for (i = 0; i < child_count; i++) { c = CreateRectRgnIndirect( &children[i] ); CombineRgn( rgn, rgn, c, RGN_DIFF ); DeleteObject( c ); }
        count = get_region_clip( rgn, TRUE, &vrect, &mrect, tmp, 16384 );
        DeleteObject( rgn );
    }
    run( "mmd (max = count)", &vrect, &mrect, count, 0 );
    run( "mmd (max = count - 1)", &vrect, &mrect, count - 1, 0 );
    run( "mmd (max = 1)", &vrect, &mrect, 1, 0 );

    /* nothing covers the surface */
    child_count = 0;
    run_scales( "no children", 1280, 720, ADISP_MAX_CLIP_RECTS );
    /* all covered */
    child_count = 0;
    add_child( -10, -10, 2000, 2000 );
    run_scales( "fully covered", 1280, 720, ADISP_MAX_CLIP_RECTS );
    /* covering windows outside of the surface */
    child_count = 0;
    add_child( 1300, 0, 1400, 100 );
    add_child( -100, -100, 0, 0 );
    run_scales( "children outside", 1280, 720, ADISP_MAX_CLIP_RECTS );
    /* thin visible strips, disappearing when scaled down */
    child_count = 0;
    add_child( 0, 0, 1280, 359 );
    add_child( 0, 360, 1280, 720 );
    add_child( 100, 0, 101, 720 );
    run_scales( "1 pixel strips", 1280, 720, ADISP_MAX_CLIP_RECTS );
    /* surface not at the origin of the virtual coordinates */
    mmd_layout( 1280, 720, 300, 4 );
    for (i = 0; i < child_count; i++) OffsetRect( &children[i], 50, 20 );
    SetRect( &vrect, 50, 20, 1330, 740 );
    SetRect( &mrect, 0, 0, 1920, 1080 );
    run( "offset virtual rect", &vrect, &mrect, 512, 1 );
    run( "offset virtual rect", &vrect, &mrect, 512, 0 );

    fclose( dump );
    printf( "region_test: %d checks, %d failures, %d reductions\n", checks, failures, warnings );
    return failures != 0;
}
