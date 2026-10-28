#define ADISP_CLIP_NONE      0xffffffff
/* a clip message must fit in ADISP_MAX_MSG_SIZE: 24 + 2048 * 16 bytes = 32 KiB,
 * a more complex clip is reduced by the client to its largest parts */
#define ADISP_MAX_CLIP_RECTS 2048

struct adisp_client_clip
{
    struct adisp_header hdr;
    uint32_t id;
    uint32_t count;           /* entries in rects (0: all covered), or ADISP_CLIP_NONE (nothing covered) */
    struct adisp_rect rects[1];
};
