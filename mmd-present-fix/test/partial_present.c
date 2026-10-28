/* A window painted with GDI (colour bands), with child buttons, and a D3D9 device
 * presenting only a part of it (src_rect == dst_rect), like MikuMikuDance does.
 * Checks what is on the screen: the D3D colour inside the presented rect, the GDI
 * colours outside of it.
 *
 * usage: partial_present.exe discard|copy|flip [full|nochild|switch|stretch]
 *   full:    present the whole window (an ordinary game), it must all show the D3D colour
 *   nochild: no child window
 *   switch:  present a part, then the whole window: it must all show the D3D colour again
 *   stretch: present the whole back buffer stretched to the part */
#include <windows.h>
#include <d3d9.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#define ARRAY_SIZE(a) (sizeof(a) / sizeof((a)[0]))

#define W 800
#define H 480
static const RECT present_rect = { 300, 25, 700, 300 };  /* like (393,25)-(1137,444) */
static const COLORREF band_colors[] = { RGB(255,0,0), RGB(0,0,255), RGB(255,255,0), RGB(255,0,255) };
#define D3D_COLOR RGB(0,255,0)

static LRESULT CALLBACK wndproc( HWND hwnd, UINT msg, WPARAM wp, LPARAM lp )
{
    if (msg == WM_PAINT)
    {
        PAINTSTRUCT ps;
        HDC hdc = BeginPaint( hwnd, &ps );
        int i;
        /* the panel background: horizontal bands, and a timeline at the bottom */
        for (i = 0; i < 4; i++)
        {
            RECT r = { 0, i * H / 4, W, (i + 1) * H / 4 };
            HBRUSH br = CreateSolidBrush( band_colors[i] );
            FillRect( hdc, &r, br );
            DeleteObject( br );
        }
        EndPaint( hwnd, &ps );
        return 0;
    }
    if (msg == WM_ERASEBKGND) return 1;
    return DefWindowProcW( hwnd, msg, wp, lp );
}

static COLORREF band_at( int y ) { return band_colors[y * 4 / H]; }

static void pump(void)
{
    MSG msg;
    while (PeekMessageW( &msg, 0, 0, 0, PM_REMOVE )) { TranslateMessage( &msg ); DispatchMessageW( &msg ); }
}

static int near_color( COLORREF a, COLORREF b )
{
    return abs( GetRValue(a) - GetRValue(b) ) < 16 && abs( GetGValue(a) - GetGValue(b) ) < 16 &&
           abs( GetBValue(a) - GetBValue(b) ) < 16;
}

int main( int argc, char **argv )
{
    const char *mode = argc > 1 ? argv[1] : "discard";
    const char *variant = argc > 2 ? argv[2] : "";
    BOOL full = !strcmp( variant, "full" ) || !strcmp( variant, "switch" );
    BOOL children = strcmp( variant, "nochild" ) != 0;
    BOOL stretch = !strcmp( variant, "stretch" );
    D3DPRESENT_PARAMETERS pp;
    IDirect3DDevice9 *device;
    IDirect3D9 *d3d;
    WNDCLASSW cls = {0};
    HWND hwnd, button;
    POINT origin = {0, 0};
    HDC screen;
    HRESULT hr;
    int i, x, y, failures = 0, checks = 0;
    struct { int x, y; const char *what; } points[] =
    {
        { 500, 150, "presented rect" },
        { 310, 35, "presented rect corner" },
        { 690, 290, "presented rect corner" },
        { 100, 50, "band 0 left" },
        { 750, 50, "band 0 right" },
        { 750, 10, "band 0 above-right" },
        { 500, 10, "band 0 above presented" },
        { 100, 170, "band 1 left" },
        { 100, 290, "band 2 left" },
        { 500, 320, "band 2 below presented" },
        { 400, 420, "band 3 timeline" },
        { 20, 420, "band 3 timeline left" },
        { 780, 470, "band 3 bottom-right" },
        { 15, 15, "button (inside nothing)" },
    };

    cls.lpfnWndProc = wndproc;
    cls.hInstance = GetModuleHandleW( NULL );
    cls.lpszClassName = L"partial_present";
    cls.hCursor = LoadCursorW( NULL, (LPCWSTR)IDC_ARROW );
    RegisterClassW( &cls );
    {
        RECT r = { 0, 0, W, H };
        AdjustWindowRect( &r, WS_OVERLAPPEDWINDOW, FALSE );
        hwnd = CreateWindowW( L"partial_present", L"partial present", WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN | WS_VISIBLE,
                              0, 0, r.right - r.left, r.bottom - r.top, 0, 0, 0, 0 );
    }
    /* child buttons, one in the panel, one overlapping the presented rect */
    if (children)
    {
        button = CreateWindowW( L"BUTTON", L"btn", WS_CHILD | WS_VISIBLE, 5, 5, 60, 25, hwnd, 0, 0, 0 );
        CreateWindowW( L"BUTTON", L"over", WS_CHILD | WS_VISIBLE, 600, 200, 60, 25, hwnd, 0, 0, 0 );
    }
    else button = 0;
    UpdateWindow( hwnd );
    pump();

    d3d = Direct3DCreate9( D3D_SDK_VERSION );
    memset( &pp, 0, sizeof(pp) );
    pp.Windowed = TRUE;
    pp.SwapEffect = !strcmp( mode, "copy" ) ? D3DSWAPEFFECT_COPY : !strcmp( mode, "flip" ) ? D3DSWAPEFFECT_FLIP : D3DSWAPEFFECT_DISCARD;
    pp.BackBufferFormat = D3DFMT_UNKNOWN;
    pp.BackBufferWidth = W;
    pp.BackBufferHeight = H;
    pp.hDeviceWindow = hwnd;
    pp.PresentationInterval = D3DPRESENT_INTERVAL_IMMEDIATE;
    hr = IDirect3D9_CreateDevice( d3d, 0, D3DDEVTYPE_HAL, hwnd, D3DCREATE_SOFTWARE_VERTEXPROCESSING, &pp, &device );
    if (FAILED(hr)) { printf( "CreateDevice failed %#lx\n", hr ); return 2; }

    for (i = 0; i < 30; i++)
    {
        IDirect3DDevice9_Clear( device, 0, NULL, D3DCLEAR_TARGET, D3DCOLOR_XRGB(0, 255, 0), 1.0f, 0 );
        if (!strcmp( variant, "switch" ) && i < 15)
            hr = IDirect3DDevice9_Present( device, &present_rect, &present_rect, hwnd, NULL );
        else if (full) hr = IDirect3DDevice9_Present( device, NULL, NULL, NULL, NULL );
        else if (stretch) hr = IDirect3DDevice9_Present( device, NULL, &present_rect, NULL, NULL );
        else hr = IDirect3DDevice9_Present( device, &present_rect, &present_rect, hwnd, NULL );
        if (FAILED(hr)) printf( "Present failed %#lx\n", hr );
        pump();
        Sleep( 20 );
    }
    Sleep( 300 );
    pump();

    ClientToScreen( hwnd, &origin );
    screen = GetDC( 0 );
    for (i = 0; i < ARRAY_SIZE(points); i++)
    {
        COLORREF expect, got;
        POINT pt = { points[i].x, points[i].y };
        x = pt.x; y = pt.y;
        if (i == ARRAY_SIZE(points) - 1)
        {
            if (!children) break;
            expect = GetSysColor( COLOR_BTNFACE );
        }
        else if (full || PtInRect( &present_rect, pt )) expect = D3D_COLOR;
        else expect = band_at( y );
        got = GetPixel( screen, origin.x + x, origin.y + y );
        if (getenv( "WINDC" ))
        {
            HDC wdc = GetDC( hwnd );
            printf( "     window dc (%3d,%3d): %06lx\n", x, y, GetPixel( wdc, x, y ) );
            ReleaseDC( hwnd, wdc );
        }
        checks++;
        if (!near_color( got, expect ))
        {
            failures++;
            printf( "FAIL %-26s (%3d,%3d): got %06lx expected %06lx\n", points[i].what, x, y, got, expect );
        }
        else printf( "ok   %-26s (%3d,%3d): %06lx\n", points[i].what, x, y, got );
    }
    ReleaseDC( 0, screen );
    printf( "mode %s %s: %d checks, %d failures\n", mode, variant, checks, failures );
    fflush( stdout );
    if (getenv( "HOLD" )) Sleep( atoi( getenv( "HOLD" ) ) );
    IDirect3DDevice9_Release( device );
    IDirect3D9_Release( d3d );
    if (button) DestroyWindow( button );
    DestroyWindow( hwnd );
    return failures ? 1 : 0;
}
