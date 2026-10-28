static void req_client_clip( struct client *client, const struct adisp_client_clip *req, size_t size )
{
    struct client_surf *surf = find_client_surf( client, req->id );
    uint32_t count = req->count;

    if (!surf) return;
    if (count != ADISP_CLIP_NONE)
    {
        if (count > ADISP_MAX_CLIP_RECTS || size < offsetof( struct adisp_client_clip, rects[count] )) return;
        memcpy( surf->clip, req->rects, count * sizeof(req->rects[0]) );
    }
    surf->clip_count = count;
    scene_mark_dirty();
}
