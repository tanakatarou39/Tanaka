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
