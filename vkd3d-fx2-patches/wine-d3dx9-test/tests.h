static void get_render_state_(int line, IDirect3DDevice9 *device, D3DRENDERSTATETYPE state, DWORD expected)
{
    DWORD value = 0xdeadbeef;
    HRESULT hr;

    hr = IDirect3DDevice9_GetRenderState(device, state, &value);
    ok_(line, hr == D3D_OK && value == expected, "Render state %#x: got %#lx, expected %#lx.\n", state, value, expected);
}
#define check_render_state(a, b, c) get_render_state_(__LINE__, a, b, c)

static void check_tss_(int line, IDirect3DDevice9 *device, DWORD stage, D3DTEXTURESTAGESTATETYPE state, DWORD expected)
{
    DWORD value = 0xdeadbeef;
    HRESULT hr;

    hr = IDirect3DDevice9_GetTextureStageState(device, stage, state, &value);
    ok_(line, hr == D3D_OK && value == expected, "Stage %lu state %#x: got %#lx, expected %#lx.\n",
            stage, state, value, expected);
}
#define check_tss(a, b, c, d) check_tss_(__LINE__, a, b, c, d)

static void check_sampler_state_(int line, IDirect3DDevice9 *device, DWORD sampler, D3DSAMPLERSTATETYPE state, DWORD expected)
{
    DWORD value = 0xdeadbeef;
    HRESULT hr;

    hr = IDirect3DDevice9_GetSamplerState(device, sampler, state, &value);
    ok_(line, hr == D3D_OK && value == expected, "Sampler %lu state %#x: got %#lx, expected %#lx.\n",
            sampler, state, value, expected);
}
#define check_sampler_state(a, b, c, d) check_sampler_state_(__LINE__, a, b, c, d)

static void test_compile_assignments(IDirect3DDevice9 *device)
{
    static const char code[] =
        "float4x4 wvp;\n"
        "float4 VS(float4 p : POSITION) : POSITION { return mul(p, wvp); }\n"
        "float4 PS(uniform float4 c) : COLOR { return c; }\n"
        "technique MainTec < string MMDPass = \"object\"; >\n"
        "{\n"
        "    pass P0\n"
        "    {\n"
        "        AlphaBlendEnable = TRUE;\n"
        "        ZEnable = TRUE;\n"
        "        CullMode = NONE;\n"
        "        ColorOp[0] = MODULATE;\n"
        "        AlphaOp[0] = SELECTARG1;\n"
        "        VertexShader = compile vs_2_0 VS();\n"
        "        PixelShader = compile ps_2_0 PS(float4(1, 0, 0, 1));\n"
        "    }\n"
        "    pass P1\n"
        "    {\n"
        "        VertexShader = NULL;\n"
        "        PixelShader = compile ps_3_0 PS(float4(0, 1, 0, 1));\n"
        "    }\n"
        "}\n";
    IDirect3DVertexShader9 *vs;
    IDirect3DPixelShader9 *ps;
    D3DXPASS_DESC pass_desc;
    ID3DXEffect *effect;
    D3DXHANDLE tech;
    UINT passes;
    HRESULT hr;

    if (!(effect = create_effect(device, code)))
        return;

    tech = effect->lpVtbl->GetTechniqueByName(effect, "MainTec");
    ok(!!tech, "Technique not found.\n");
    hr = effect->lpVtbl->GetPassDesc(effect, effect->lpVtbl->GetPass(effect, tech, 0), &pass_desc);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    ok(pass_desc.pVertexShaderFunction && *pass_desc.pVertexShaderFunction == 0xfffe0200,
            "Unexpected vertex shader %p.\n", pass_desc.pVertexShaderFunction);
    ok(pass_desc.pPixelShaderFunction && *pass_desc.pPixelShaderFunction == 0xffff0200,
            "Unexpected pixel shader %p.\n", pass_desc.pPixelShaderFunction);
    hr = effect->lpVtbl->GetPassDesc(effect, effect->lpVtbl->GetPass(effect, tech, 1), &pass_desc);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    ok(!pass_desc.pVertexShaderFunction, "Unexpected vertex shader %p.\n", pass_desc.pVertexShaderFunction);
    ok(pass_desc.pPixelShaderFunction && *pass_desc.pPixelShaderFunction == 0xffff0300,
            "Unexpected pixel shader %p.\n", pass_desc.pPixelShaderFunction);

    hr = effect->lpVtbl->SetTechnique(effect, tech);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = effect->lpVtbl->Begin(effect, &passes, 0);
    ok(hr == D3D_OK && passes == 2, "Got hr %#lx, passes %u.\n", hr, passes);

    hr = effect->lpVtbl->BeginPass(effect, 0);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    check_render_state(device, D3DRS_ALPHABLENDENABLE, TRUE);
    check_render_state(device, D3DRS_ZENABLE, D3DZB_TRUE);
    check_render_state(device, D3DRS_CULLMODE, D3DCULL_NONE);
    check_tss(device, 0, D3DTSS_COLOROP, D3DTOP_MODULATE);
    check_tss(device, 0, D3DTSS_ALPHAOP, D3DTOP_SELECTARG1);
    hr = IDirect3DDevice9_GetVertexShader(device, &vs);
    ok(hr == D3D_OK && vs, "Got hr %#lx, vs %p.\n", hr, vs);
    if (vs)
        IDirect3DVertexShader9_Release(vs);
    hr = IDirect3DDevice9_GetPixelShader(device, &ps);
    ok(hr == D3D_OK && ps, "Got hr %#lx, ps %p.\n", hr, ps);
    if (ps)
        IDirect3DPixelShader9_Release(ps);
    effect->lpVtbl->EndPass(effect);

    hr = effect->lpVtbl->BeginPass(effect, 1);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = IDirect3DDevice9_GetVertexShader(device, &vs);
    ok(hr == D3D_OK && !vs, "Got hr %#lx, vs %p.\n", hr, vs);
    hr = IDirect3DDevice9_GetPixelShader(device, &ps);
    ok(hr == D3D_OK && ps, "Got hr %#lx, ps %p.\n", hr, ps);
    if (ps)
        IDirect3DPixelShader9_Release(ps);
    effect->lpVtbl->EndPass(effect);
    effect->lpVtbl->End(effect);

    effect->lpVtbl->Release(effect);
}

static void test_reference_assignments(IDirect3DDevice9 *device)
{
    static const char code[] =
        "float4x4 camera;\n"
        "bool enable;\n"
        "int fill_mode;\n"
        "float4 VS(float4 p : POSITION) : POSITION { return p; }\n"
        "float4 PS() : COLOR { return 1; }\n"
        "vertexshader vs = compile vs_2_0 VS();\n"
        "vertexshader vs_arr[2] = { compile vs_2_0 VS(), compile vs_3_0 VS() };\n"
        "pixelshader ps = compile ps_2_0 PS();\n"
        "texture tex;\n"
        "technique T\n"
        "{\n"
        "    pass P0\n"
        "    {\n"
        "        VertexShader = <vs>;\n"
        "        PixelShader = (ps);\n"
        "        Texture[0] = <tex>;\n"
        "        ViewTransform = <camera>;\n"
        "        AlphaBlendEnable = <enable>;\n"
        "        FillMode = <fill_mode>;\n"
        "    }\n"
        "    pass P1 { VertexShader = vs_arr[1]; }\n"
        "}\n";
    static const D3DXMATRIX camera = {{{1.0f, 2.0f, 3.0f, 4.0f, 5.0f, 6.0f, 7.0f, 8.0f,
            9.0f, 10.0f, 11.0f, 12.0f, 13.0f, 14.0f, 15.0f, 16.0f}}};
    IDirect3DVertexShader9 *vs, *expected_vs;
    IDirect3DPixelShader9 *ps, *expected_ps;
    IDirect3DBaseTexture9 *texture;
    IDirect3DTexture9 *tex;
    ID3DXEffect *effect;
    D3DMATRIX matrix;
    UINT passes;
    HRESULT hr;

    if (!(effect = create_effect(device, code)))
        return;

    hr = IDirect3DDevice9_CreateTexture(device, 4, 4, 1, 0, D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &tex, NULL);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = effect->lpVtbl->SetTexture(effect, "tex", (IDirect3DBaseTexture9 *)tex);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = effect->lpVtbl->SetBool(effect, "enable", TRUE);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = effect->lpVtbl->SetInt(effect, "fill_mode", D3DFILL_WIREFRAME);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = effect->lpVtbl->SetMatrix(effect, "camera", &camera);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);

    hr = effect->lpVtbl->Begin(effect, &passes, 0);
    ok(hr == D3D_OK && passes == 2, "Got hr %#lx, passes %u.\n", hr, passes);
    hr = effect->lpVtbl->BeginPass(effect, 0);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);

    check_render_state(device, D3DRS_ALPHABLENDENABLE, TRUE);
    check_render_state(device, D3DRS_FILLMODE, D3DFILL_WIREFRAME);
    hr = IDirect3DDevice9_GetTransform(device, D3DTS_VIEW, &matrix);
    ok(hr == D3D_OK && !memcmp(&matrix, &camera, sizeof(matrix)), "Got hr %#lx, unexpected view matrix.\n", hr);
    hr = IDirect3DDevice9_GetTexture(device, 0, &texture);
    ok(hr == D3D_OK && texture == (IDirect3DBaseTexture9 *)tex, "Got hr %#lx, texture %p.\n", hr, texture);
    if (texture)
        IDirect3DBaseTexture9_Release(texture);

    hr = effect->lpVtbl->GetVertexShader(effect, "vs", &expected_vs);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = IDirect3DDevice9_GetVertexShader(device, &vs);
    ok(hr == D3D_OK && vs && vs == expected_vs, "Got hr %#lx, vs %p, expected %p.\n", hr, vs, expected_vs);
    if (vs)
        IDirect3DVertexShader9_Release(vs);
    IDirect3DVertexShader9_Release(expected_vs);
    hr = effect->lpVtbl->GetPixelShader(effect, "ps", &expected_ps);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = IDirect3DDevice9_GetPixelShader(device, &ps);
    ok(hr == D3D_OK && ps && ps == expected_ps, "Got hr %#lx, ps %p, expected %p.\n", hr, ps, expected_ps);
    if (ps)
        IDirect3DPixelShader9_Release(ps);
    IDirect3DPixelShader9_Release(expected_ps);
    effect->lpVtbl->EndPass(effect);

    hr = effect->lpVtbl->BeginPass(effect, 1);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = effect->lpVtbl->GetVertexShader(effect, "vs_arr[1]", &expected_vs);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = IDirect3DDevice9_GetVertexShader(device, &vs);
    ok(hr == D3D_OK && vs && vs == expected_vs, "Got hr %#lx, vs %p, expected %p.\n", hr, vs, expected_vs);
    if (vs)
        IDirect3DVertexShader9_Release(vs);
    IDirect3DVertexShader9_Release(expected_vs);
    effect->lpVtbl->EndPass(effect);
    effect->lpVtbl->End(effect);

    effect->lpVtbl->Release(effect);
    IDirect3DTexture9_Release(tex);
}

static void test_sampler_states(IDirect3DDevice9 *device)
{
    static const char code[] =
        "texture tex;\n"
        "texture2D tex2;\n"
        "sampler s = sampler_state\n"
        "{\n"
        "    Texture = <tex>;\n"
        "    MinFilter = LINEAR;\n"
        "    MagFilter = POINT;\n"
        "    AddressU = CLAMP;\n"
        "};\n"
        "sampler2D samplers[2] =\n"
        "{\n"
        "    sampler_state { MipFilter = POINT; },\n"
        "    sampler_state { Texture = <tex2>; AddressV = MIRROR; }\n"
        "};\n"
        "sampler unused;\n"
        "float4 PS(float2 t : TEXCOORD0) : COLOR\n"
        "{\n"
        "    return tex2D(s, t) + tex2D(samplers[1], t);\n"
        "}\n"
        "technique T { pass P { PixelShader = compile ps_2_0 PS(); } }\n";
    IDirect3DBaseTexture9 *texture;
    IDirect3DTexture9 *tex, *tex2;
    ID3DXConstantTable *constants;
    D3DXPASS_DESC pass_desc;
    D3DXPARAMETER_DESC desc;
    UINT s0, s1;
    ID3DXEffect *effect;
    UINT passes;
    HRESULT hr;

    if (!(effect = create_effect(device, code)))
        return;

    hr = effect->lpVtbl->GetParameterDesc(effect, "unused", &desc);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);

    hr = IDirect3DDevice9_CreateTexture(device, 4, 4, 1, 0, D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &tex, NULL);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = IDirect3DDevice9_CreateTexture(device, 4, 4, 1, 0, D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &tex2, NULL);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = effect->lpVtbl->SetTexture(effect, "tex", (IDirect3DBaseTexture9 *)tex);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = effect->lpVtbl->SetTexture(effect, "tex2", (IDirect3DBaseTexture9 *)tex2);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);

    hr = effect->lpVtbl->Begin(effect, &passes, 0);
    ok(hr == D3D_OK && passes == 1, "Got hr %#lx, passes %u.\n", hr, passes);
    hr = effect->lpVtbl->BeginPass(effect, 0);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);

    hr = effect->lpVtbl->GetPassDesc(effect, effect->lpVtbl->GetPass(effect, "T", 0), &pass_desc);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = pD3DXGetShaderConstantTable(pass_desc.pPixelShaderFunction, &constants);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    s0 = constants->lpVtbl->GetSamplerIndex(constants, "s");
    s1 = constants->lpVtbl->GetSamplerIndex(constants, "samplers[1]");
    ok(s0 != ~0u && s1 != ~0u, "Got sampler indices %u, %u.\n", s0, s1);
    constants->lpVtbl->Release(constants);

    check_sampler_state(device, s0, D3DSAMP_MINFILTER, D3DTEXF_LINEAR);
    check_sampler_state(device, s0, D3DSAMP_MAGFILTER, D3DTEXF_POINT);
    check_sampler_state(device, s0, D3DSAMP_ADDRESSU, D3DTADDRESS_CLAMP);
    check_sampler_state(device, s1, D3DSAMP_ADDRESSV, D3DTADDRESS_MIRROR);
    hr = IDirect3DDevice9_GetTexture(device, s0, &texture);
    ok(hr == D3D_OK && texture == (IDirect3DBaseTexture9 *)tex, "Got hr %#lx, texture %p.\n", hr, texture);
    if (texture)
        IDirect3DBaseTexture9_Release(texture);
    hr = IDirect3DDevice9_GetTexture(device, s1, &texture);
    ok(hr == D3D_OK && texture == (IDirect3DBaseTexture9 *)tex2, "Got hr %#lx, texture %p.\n", hr, texture);
    if (texture)
        IDirect3DBaseTexture9_Release(texture);

    effect->lpVtbl->EndPass(effect);
    effect->lpVtbl->End(effect);

    effect->lpVtbl->Release(effect);
    IDirect3DTexture9_Release(tex2);
    IDirect3DTexture9_Release(tex);
}

static DWORD float_to_dword(float f)
{
    DWORD d;

    memcpy(&d, &f, sizeof(d));
    return d;
}

static void test_expression_assignments(IDirect3DDevice9 *device)
{
    static const char code[] =
        "float density;\n"
        "float4 factor;\n"
        "bool enable;\n"
        "int mode;\n"
        "technique T\n"
        "{\n"
        "    pass P0\n"
        "    {\n"
        "        FogDensity = density * 2.0;\n"
        "        AlphaBlendEnable = !enable;\n"
        "        ZEnable = (density > 0.5);\n"
        "        AlphaRef = enable ? 128 : 64;\n"
        "        FogStart = density / 4.0 + 1.0;\n"
        "        FogEnd = max(density, 0.25);\n"
        "        TextureFactor = (mode == 2) ? 0xff : 0x10;\n"
        "        LightType[0] = POINT;\n"
        "        LightDiffuse[0] = factor * 0.5;\n"
        "        LightPosition[0] = factor.zyx;\n"
        "    }\n"
        "}\n";
    static const float factor[4] = {1.0f, 2.0f, 3.0f, 4.0f};
    ID3DXEffect *effect;
    D3DLIGHT9 light;
    UINT passes;
    HRESULT hr;

    if (!(effect = create_effect(device, code)))
        return;

    hr = effect->lpVtbl->SetFloat(effect, "density", 0.75f);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = effect->lpVtbl->SetBool(effect, "enable", TRUE);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = effect->lpVtbl->SetInt(effect, "mode", 2);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = effect->lpVtbl->SetVector(effect, "factor", (const D3DXVECTOR4 *)factor);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);

    hr = effect->lpVtbl->Begin(effect, &passes, 0);
    ok(hr == D3D_OK && passes == 1, "Got hr %#lx, passes %u.\n", hr, passes);
    hr = effect->lpVtbl->BeginPass(effect, 0);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    check_render_state(device, D3DRS_FOGDENSITY, float_to_dword(1.5f));
    check_render_state(device, D3DRS_ALPHABLENDENABLE, FALSE);
    check_render_state(device, D3DRS_ZENABLE, D3DZB_TRUE);
    check_render_state(device, D3DRS_ALPHAREF, 128);
    check_render_state(device, D3DRS_FOGSTART, float_to_dword(1.1875f));
    check_render_state(device, D3DRS_FOGEND, float_to_dword(0.75f));
    check_render_state(device, D3DRS_TEXTUREFACTOR, 0xff);
    hr = IDirect3DDevice9_GetLight(device, 0, &light);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    ok(light.Diffuse.r == 0.5f && light.Diffuse.g == 1.0f && light.Diffuse.b == 1.5f && light.Diffuse.a == 2.0f,
            "Got diffuse {%.8e, %.8e, %.8e, %.8e}.\n", light.Diffuse.r, light.Diffuse.g, light.Diffuse.b, light.Diffuse.a);
    ok(light.Position.x == 3.0f && light.Position.y == 2.0f && light.Position.z == 1.0f,
            "Got position {%.8e, %.8e, %.8e}.\n", light.Position.x, light.Position.y, light.Position.z);

    hr = effect->lpVtbl->SetFloat(effect, "density", 0.125f);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = effect->lpVtbl->SetBool(effect, "enable", FALSE);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = effect->lpVtbl->SetInt(effect, "mode", 1);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    hr = effect->lpVtbl->CommitChanges(effect);
    ok(hr == D3D_OK, "Got hr %#lx.\n", hr);
    check_render_state(device, D3DRS_FOGDENSITY, float_to_dword(0.25f));
    check_render_state(device, D3DRS_ALPHABLENDENABLE, TRUE);
    check_render_state(device, D3DRS_ZENABLE, D3DZB_FALSE);
    check_render_state(device, D3DRS_ALPHAREF, 64);
    check_render_state(device, D3DRS_FOGEND, float_to_dword(0.25f));
    check_render_state(device, D3DRS_TEXTUREFACTOR, 0x10);

    effect->lpVtbl->EndPass(effect);
    effect->lpVtbl->End(effect);
    effect->lpVtbl->Release(effect);
}

static void run_tests(IDirect3DDevice9 *device)
{
    test_compile_assignments(device);
    test_reference_assignments(device);
    test_sampler_states(device);
    test_expression_assignments(device);
}
