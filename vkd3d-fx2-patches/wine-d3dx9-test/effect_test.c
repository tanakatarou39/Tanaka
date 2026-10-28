#define COBJMACROS
#include <windows.h>
#include <stdio.h>
#include <d3d9.h>
#include <d3dx9.h>

static int failures, successes;

#define ok(cond, ...) ok_(__LINE__, cond, __VA_ARGS__)
static void ok_(int line, int cond, const char *fmt, ...)
{
    va_list args;

    if (cond)
    {
        ++successes;
        return;
    }
    ++failures;
    printf("effect_test.c:%d: Test failed: ", line);
    va_start(args, fmt);
    vprintf(fmt, args);
    va_end(args);
}

static HRESULT (WINAPI *pD3DXCreateEffect)(IDirect3DDevice9 *device, const void *data, UINT data_size,
        const D3DXMACRO *defines, ID3DXInclude *include, DWORD flags, ID3DXEffectPool *pool,
        ID3DXEffect **effect, ID3DXBuffer **errors);
static HRESULT (WINAPI *pD3DXGetShaderConstantTable)(const DWORD *byte_code, ID3DXConstantTable **constant_table);

static IDirect3DDevice9 *create_device(HWND window)
{
    D3DPRESENT_PARAMETERS params = {0};
    IDirect3DDevice9 *device;
    IDirect3D9 *d3d;
    HRESULT hr;

    if (!(d3d = Direct3DCreate9(D3D_SDK_VERSION)))
        return NULL;
    params.Windowed = TRUE;
    params.SwapEffect = D3DSWAPEFFECT_DISCARD;
    params.hDeviceWindow = window;
    hr = IDirect3D9_CreateDevice(d3d, D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, window,
            D3DCREATE_SOFTWARE_VERTEXPROCESSING, &params, &device);
    IDirect3D9_Release(d3d);
    return SUCCEEDED(hr) ? device : NULL;
}

static ID3DXEffect *create_effect(IDirect3DDevice9 *device, const char *code)
{
    ID3DXBuffer *errors = NULL;
    ID3DXEffect *effect = NULL;
    HRESULT hr;

    hr = pD3DXCreateEffect(device, code, strlen(code), NULL, NULL, 0, NULL, &effect, &errors);
    ok(hr == D3D_OK, "Failed to create effect, hr %#lx.\n", hr);
    if (errors)
    {
        printf("%s", (const char *)ID3DXBuffer_GetBufferPointer(errors));
        ID3DXBuffer_Release(errors);
    }
    return effect;
}

#include "tests.h"

static void test_file(IDirect3DDevice9 *device, const char *path)
{
    D3DXHANDLE tech, pass;
    D3DXTECHNIQUE_DESC tech_desc;
    D3DXEFFECT_DESC desc;
    ID3DXEffect *effect;
    UINT i, j, passes;
    char *code;
    FILE *f;
    long size;
    HRESULT hr;

    f = fopen(path, "rb");
    fseek(f, 0, SEEK_END);
    size = ftell(f);
    fseek(f, 0, SEEK_SET);
    code = calloc(1, size + 1);
    fread(code, 1, size, f);
    fclose(f);

    effect = create_effect(device, code);
    free(code);
    if (!effect)
        return;

    effect->lpVtbl->GetDesc(effect, &desc);
    printf("%s: %u parameters, %u techniques.\n", path, desc.Parameters, desc.Techniques);
    for (i = 0; i < desc.Techniques; ++i)
    {
        tech = effect->lpVtbl->GetTechnique(effect, i);
        effect->lpVtbl->GetTechniqueDesc(effect, tech, &tech_desc);
        hr = effect->lpVtbl->ValidateTechnique(effect, tech);
        ok(hr == D3D_OK, "Technique %s failed validation, hr %#lx.\n", tech_desc.Name, hr);
        hr = effect->lpVtbl->SetTechnique(effect, tech);
        ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
        hr = effect->lpVtbl->Begin(effect, &passes, 0);
        ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
        for (j = 0; j < passes; ++j)
        {
            D3DXPASS_DESC pass_desc;

            pass = effect->lpVtbl->GetPass(effect, tech, j);
            effect->lpVtbl->GetPassDesc(effect, pass, &pass_desc);
            hr = effect->lpVtbl->BeginPass(effect, j);
            ok(hr == D3D_OK, "Technique %s pass %s: got hr %#lx.\n", tech_desc.Name, pass_desc.Name, hr);
            printf("  %s.%s: vs %08lx ps %08lx\n", tech_desc.Name, pass_desc.Name,
                    pass_desc.pVertexShaderFunction ? *pass_desc.pVertexShaderFunction : 0,
                    pass_desc.pPixelShaderFunction ? *pass_desc.pPixelShaderFunction : 0);
            effect->lpVtbl->EndPass(effect);
        }
        effect->lpVtbl->End(effect);
    }
    effect->lpVtbl->Release(effect);
}

int main(int argc, char **argv)
{
    IDirect3DDevice9 *device;
    HMODULE d3dx;
    HWND window;

    d3dx = LoadLibraryA("d3dx9_36.dll");
    pD3DXCreateEffect = (void *)GetProcAddress(d3dx, "D3DXCreateEffect");
    pD3DXGetShaderConstantTable = (void *)GetProcAddress(d3dx, "D3DXGetShaderConstantTable");
    window = CreateWindowA("static", "effect_test", WS_OVERLAPPEDWINDOW, 0, 0, 640, 480, NULL, NULL, NULL, NULL);
    if (!(device = create_device(window)))
    {
        printf("Failed to create a device.\n");
        return 1;
    }

    if (argc > 1)
        test_file(device, argv[1]);
    else
        run_tests(device);

    IDirect3DDevice9_Release(device);
    DestroyWindow(window);
    printf("%d tests executed, %d failures.\n", successes + failures, failures);
    return !!failures;
}
