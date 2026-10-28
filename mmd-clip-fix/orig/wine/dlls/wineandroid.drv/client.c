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

static UINT get_client_clip( struct android_client_surface *surface, struct adisp_rect *rects )
{
    HWND hwnd = surface->base.hwnd, toplevel = surface->base.toplevel, win, other;
    RECT vrect = surface->base.virtual_rect, mrect = surface->base.monitor_rect;
    UINT dpi = NtUserGetDpiForWindow( hwnd ), count = ADISP_CLIP_NONE, i;
    int vw = vrect.right - vrect.left, vh = vrect.bottom - vrect.top;
    BOOL covered = FALSE;
    POINT origin;
    char buffer[sizeof(RGNDATAHEADER) + ADISP_MAX_CLIP_RECTS * sizeof(RECT)];
    RGNDATA *data = (RGNDATA *)buffer;
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

    if (covered && NtGdiGetRegionData( rgn, sizeof(buffer), data ) && data->rdh.nCount <= ADISP_MAX_CLIP_RECTS)
    {
        const RECT *r = (const RECT *)data->Buffer;
        int mw = mrect.right - mrect.left, mh = mrect.bottom - mrect.top;

        /* from the virtual coordinates of the region to the monitor ones of the surface rect */
        for (i = 0; i < data->rdh.nCount; i++)
        {
            rects[i].left   = mrect.left + scale( r[i].left - vrect.left, mw, vw );
            rects[i].top    = mrect.top + scale( r[i].top - vrect.top, mh, vh );
            rects[i].right  = mrect.left + scale( r[i].right - vrect.left, mw, vw );
            rects[i].bottom = mrect.top + scale( r[i].bottom - vrect.top, mh, vh );
        }
        count = data->rdh.nCount;
    }
    NtGdiDeleteObjectApp( rgn );
    return count;
}

static void send_client_clip( struct android_client_surface *surface )
{
    char buffer[offsetof( struct adisp_client_clip, rects[ADISP_MAX_CLIP_RECTS] )];
    struct adisp_client_clip *msg = (struct adisp_client_clip *)buffer;
    UINT count = get_client_clip( surface, msg->rects ), n = count == ADISP_CLIP_NONE ? 0 : count;

    if (count == surface->sent_clip_count &&
        !memcmp( msg->rects, surface->sent_clip, n * sizeof(msg->rects[0]) ))
        return;
    surface->sent_clip_count = count;
    memcpy( surface->sent_clip, msg->rects, n * sizeof(msg->rects[0]) );

    TRACE( "%s clip %u rects\n", debugstr_client_surface( &surface->base ), count );
    msg->hdr.type = ADISP_REQ_CLIENT_CLIP;
    msg->hdr.size = offsetof( struct adisp_client_clip, rects[n] );
    msg->id       = surface->id;
    msg->count    = count;
    display_send( msg, msg->hdr.size, -1 );
}
