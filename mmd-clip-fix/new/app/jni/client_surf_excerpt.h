struct client_surf
{
    struct client_surf *next;
    struct client  *client;
    uint32_t        id;
    uint32_t        toplevel;
    uint32_t        flags;      /* ADISP_CLIENT_* */
    struct adisp_rect rect;     /* relative to the toplevel visible rect */
    /* the parts not covered by other windows of the toplevel, like rect, ADISP_CLIP_NONE: all */
    uint32_t        clip_count;
    struct adisp_rect *clip;   /* clip_size allocated entries */
    uint32_t        clip_size;
    struct client_buffer buffers[MAX_CLIENT_BUFFERS];
    int             displayed;  /* buffer on screen, -1 if none */
    int             pending;    /* newer buffer waiting to be drawn, -1 if none */
    /* buffers replaced while a frame the GPU hasn't finished may read them, released later */
    int             retired[MAX_CLIENT_BUFFERS];
    int             retired_count;
};
