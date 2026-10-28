#define ADISP_CLIP_NONE      0xffffffff
#define ADISP_MAX_CLIP_RECTS 64

struct adisp_client_clip
{
    struct adisp_header hdr;
    uint32_t id;
    uint32_t count;           /* entries in rects, or ADISP_CLIP_NONE */
    struct adisp_rect rects[1];
};
