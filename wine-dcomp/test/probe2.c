#include <windows.h>
#include <stdio.h>
#include <stdlib.h>

static BITMAPINFO bmi = {{sizeof(BITMAPINFOHEADER), 64, -64, 1, 32, BI_RGB}};
static DWORD bits[64*64];

static void pump(DWORD ms)
{
    MSG msg;
    DWORD end = GetTickCount() + ms;
    while (GetTickCount() < end)
    {
        while (PeekMessageA(&msg, 0, 0, 0, PM_REMOVE)) DispatchMessageA(&msg);
        Sleep(10);
    }
}

static void getdc_fill(HWND w, DWORD c)
{
    HDC dc = GetDCEx(w, 0, DCX_CACHE);
    for (int i = 0; i < 64*64; i++) bits[i] = c;
    SetDIBitsToDevice(dc, 0, 0, 64, 64, 0, 0, 0, 64, bits, &bmi, DIB_RGB_COLORS);
    ReleaseDC(w, dc);
}

static void ulw_fill(HWND w, DWORD c)
{
    HDC sdc = CreateCompatibleDC(0);
    void *p;
    HBITMAP bm = CreateDIBSection(sdc, &bmi, DIB_RGB_COLORS, &p, 0, 0);
    SIZE sz = {64, 64};
    POINT src = {0, 0};
    BLENDFUNCTION bf = {AC_SRC_OVER, 0, 255, AC_SRC_ALPHA};
    BOOL ret;
    for (int i = 0; i < 64*64; i++) ((DWORD *)p)[i] = c;
    SelectObject(sdc, bm);
    ret = UpdateLayeredWindow(w, 0, NULL, &sz, sdc, &src, 0, &bf, ULW_ALPHA);
    printf("ulw ret %d\n", ret);
    DeleteDC(sdc);
    DeleteObject(bm);
}

int main(int argc, char **argv)
{
    int variant = atoi(argv[1]);
    DWORD chromium_ex = WS_EX_NOPARENTNOTIFY | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOREDIRECTIONBITMAP;
    HWND parent, child, inner;
    POINT pt = {10, 10};

    parent = CreateWindowExA(0, "static", NULL, WS_POPUP | WS_VISIBLE | WS_CLIPCHILDREN,
            100, 100, 200, 200, 0, 0, 0, NULL);
    pump(500);
    child = CreateWindowExA(variant == 0 ? 0 : chromium_ex, "static", NULL, WS_CHILD | WS_DISABLED | WS_VISIBLE,
            0, 0, 64, 64, parent, 0, 0, NULL);
    pump(300);
    switch (variant)
    {
    case 0: case 1: getdc_fill(child, 0x00ff0000); break;            /* red via GetDC */
    case 2:                                                             /* inner child, green */
        inner = CreateWindowExA(0, "static", NULL, WS_CHILD | WS_DISABLED | WS_VISIBLE,
                0, 0, 64, 64, child, 0, 0, NULL);
        pump(300);
        getdc_fill(inner, 0x0000ff00);
        break;
    case 3: ulw_fill(child, 0xff0000ff); break;                         /* blue via ULW */
    case 4: SetLayeredWindowAttributes(child, 0, 255, LWA_ALPHA); pump(200); getdc_fill(child, 0x00ff0000); break;
    }
    pump(200);
    ClientToScreen(child, &pt);
    printf("pt %ld %ld\n", pt.x, pt.y);
    fflush(stdout);
    pump(4000);
    return 0;
}
