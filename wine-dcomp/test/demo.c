/* Present a colour through DirectComposition to a Chromium-style child window and wait. */
#define COBJMACROS
#include <windows.h>
#include <initguid.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <stdio.h>

DEFINE_GUID(IID_IDCompositionDesktopDevice, 0x5f4633fe,0x1e08,0x4cb8,0x8c,0x75,0xce,0x24,0x33,0x3f,0x56,0x02);
typedef HRESULT (WINAPI *create3_t)(IUnknown *, REFIID, void **);
typedef struct { void **vtbl; } com;
#define VT(o, i) (((com *)(o))->vtbl[i])

int main(void)
{
    static const float color[] = {0.0f, 1.0f, 0.0f, 1.0f};
    DXGI_SWAP_CHAIN_DESC1 desc = {64, 64, DXGI_FORMAT_B8G8R8A8_UNORM, FALSE, {1, 0},
            DXGI_USAGE_RENDER_TARGET_OUTPUT, 2, DXGI_SCALING_STRETCH, DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL,
            DXGI_ALPHA_MODE_IGNORE, 0};
    create3_t create3 = (create3_t)GetProcAddress(LoadLibraryA("dcomp.dll"), "DCompositionCreateDevice3");
    ID3D11Device *dev; ID3D11DeviceContext *ctx; IDXGIDevice *dxgi; IDXGIAdapter *adapter; IDXGIFactory2 *factory;
    IDXGISwapChain1 *sc; ID3D11Texture2D *buf; ID3D11RenderTargetView *rtv;
    void *dcomp, *target, *visual;
    HWND parent, hwnd;
    POINT pt = {10, 10};
    MSG msg;
    HRESULT hr;

    parent = CreateWindowA("static", NULL, WS_POPUP | WS_VISIBLE, 100, 100, 200, 200, 0, 0, 0, NULL);
    hwnd = CreateWindowExA(WS_EX_NOPARENTNOTIFY | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOREDIRECTIONBITMAP,
            "static", NULL, WS_CHILD | WS_DISABLED | WS_VISIBLE, 0, 0, 200, 200, parent, 0, 0, NULL);
    hr = D3D11CreateDevice(NULL, D3D_DRIVER_TYPE_HARDWARE, NULL, D3D11_CREATE_DEVICE_BGRA_SUPPORT, NULL, 0,
            D3D11_SDK_VERSION, &dev, NULL, &ctx);
    ID3D11Device_QueryInterface(dev, &IID_IDXGIDevice, (void **)&dxgi);
    IDXGIDevice_GetAdapter(dxgi, &adapter);
    IDXGIAdapter_GetParent(adapter, &IID_IDXGIFactory2, (void **)&factory);
    hr = IDXGIFactory2_CreateSwapChainForComposition(factory, (IUnknown *)dev, &desc, NULL, &sc);
    printf("CreateSwapChainForComposition %#lx\n", hr);
    hr = create3((IUnknown *)dxgi, &IID_IDCompositionDesktopDevice, &dcomp);
    printf("DCompositionCreateDevice3 %#lx\n", hr);
    /* IDCompositionDesktopDevice: CreateVisual = 6, Commit = 3, CreateTargetForHwnd = 24 */
    ((HRESULT (WINAPI *)(void *, HWND, BOOL, void **))VT(dcomp, 24))(dcomp, hwnd, TRUE, &target);
    ((HRESULT (WINAPI *)(void *, void **))VT(dcomp, 6))(dcomp, &visual);
    IDXGISwapChain1_GetBuffer(sc, 0, &IID_ID3D11Texture2D, (void **)&buf);
    ID3D11Device_CreateRenderTargetView(dev, (ID3D11Resource *)buf, NULL, &rtv);
    ID3D11DeviceContext_ClearRenderTargetView(ctx, rtv, color);
    IDXGISwapChain1_Present(sc, 0, 0);
    /* IDCompositionVisual: SetContent = 15; IDCompositionTarget: SetRoot = 3 */
    ((HRESULT (WINAPI *)(void *, IUnknown *))VT(visual, 15))(visual, (IUnknown *)sc);
    ((HRESULT (WINAPI *)(void *, void *))VT(target, 3))(target, visual);
    hr = ((HRESULT (WINAPI *)(void *))VT(dcomp, 3))(dcomp);
    printf("Commit %#lx\n", hr);
    ClientToScreen(hwnd, &pt);
    printf("pt %ld %ld\n", pt.x, pt.y);
    fflush(stdout);
    for (int i = 0; i < 400; i++) { while (PeekMessageA(&msg, 0, 0, 0, PM_REMOVE)) DispatchMessageA(&msg); Sleep(10); }
    return 0;
}
