static void draw_client_surfaces( struct window *win, float alpha )
{
    GLint filter = config.linear_filter ? GL_LINEAR : GL_NEAREST;
    struct client_surf *surf;

    for (surf = scene.client_surfs; surf; surf = surf->next)
    {
        struct client_buffer *buf;
        struct adisp_rect rc, clip;
        int index;
        uint32_t n;
        float w, h, u0, v0, u1, v1;

        if (surf->toplevel != win->hwnd || !(surf->flags & ADISP_CLIENT_VISIBLE)) continue;
        if (surf->pending >= 0)
        {
            /* the new frame replaces the displayed one, which earlier frames may still read */
            client_surf_retire( surf, surf->displayed, false );
            surf->displayed = surf->pending;
            surf->pending = -1;
            scene.stat_frames++;
        }
        if ((index = surf->displayed) < 0) continue;
        buf = &surf->buffers[index];
        if (!buf->ahb || !import_client_buffer( buf )) continue;
        buf->last_used = scene.frame_serial;

        /* clip to the top-level window */
        rc = surf->rect;
        if (rc.right <= rc.left || rc.bottom <= rc.top) continue;
        clip.left = rc.left < 0 ? 0 : rc.left;
        clip.top = rc.top < 0 ? 0 : rc.top;
        clip.right = win->visible.right - win->visible.left;
        clip.bottom = win->visible.bottom - win->visible.top;
        if (rc.right < clip.right) clip.right = rc.right;
        if (rc.bottom < clip.bottom) clip.bottom = rc.bottom;
        if (clip.right <= clip.left || clip.bottom <= clip.top) continue;
        w = rc.right - rc.left;
        h = rc.bottom - rc.top;

        glBindTexture( GL_TEXTURE_2D, buf->tex );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, filter );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, filter );
        glUniform1i( loc_mode, (win->flags & ADISP_WIN_GLASS) ? MODE_RGBA | MODE_PERPIXEL | MODE_GLASS : MODE_RGBA );
        glUniform1f( loc_alpha, alpha );

        /* only the parts the other windows of the top-level don't cover (see ADISP_REQ_CLIENT_CLIP) */
        for (n = 0; n < (surf->clip_count == ADISP_CLIP_NONE ? 1 : surf->clip_count); n++)
        {
            struct adisp_rect part = clip;

            if (surf->clip_count != ADISP_CLIP_NONE)
            {
                const struct adisp_rect *cr = &surf->clip[n];
                if (cr->left > part.left) part.left = cr->left;
                if (cr->top > part.top) part.top = cr->top;
                if (cr->right < part.right) part.right = cr->right;
                if (cr->bottom < part.bottom) part.bottom = cr->bottom;
                if (part.right <= part.left || part.bottom <= part.top) continue;
            }
            u0 = (part.left - rc.left) / w;
            v0 = (part.top - rc.top) / h;
            u1 = (part.right - rc.left) / w;
            v1 = (part.bottom - rc.top) / h;
            draw_quad_uv( win->visible.left + part.left, win->visible.top + part.top,
                          part.right - part.left, part.bottom - part.top, u0, v0, u1, v1 );
        }
    }
}
