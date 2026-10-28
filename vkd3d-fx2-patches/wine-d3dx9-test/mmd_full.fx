float4x4 WorldViewProjMatrix : WORLDVIEWPROJECTION;
float4x4 WorldMatrix : WORLD;
float4x4 ViewMatrix : VIEW;
float4x4 LightWorldViewProjMatrix : WORLDVIEWPROJECTION < string Object = "Light"; >;
float3 LightDirection : DIRECTION < string Object = "Light"; >;
float3 CameraPosition : POSITION < string Object = "Camera"; >;
float4 MaterialDiffuse : DIFFUSE < string Object = "Geometry"; >;
float3 MaterialAmbient : AMBIENT < string Object = "Geometry"; >;
float3 MaterialEmmisive : EMISSIVE < string Object = "Geometry"; >;
float3 MaterialSpecular : SPECULAR < string Object = "Geometry"; >;
float SpecularPower : SPECULARPOWER < string Object = "Geometry"; >;
float3 MaterialToon : TOONCOLOR;
float4 EdgeColor : EDGECOLOR;
float3 LightDiffuse : DIFFUSE < string Object = "Light"; >;
float3 LightAmbient : AMBIENT < string Object = "Light"; >;
float3 LightSpecular : SPECULAR < string Object = "Light"; >;
static float4 DiffuseColor = MaterialDiffuse * float4(LightDiffuse, 1.0f);
static float3 AmbientColor = saturate(MaterialAmbient * LightAmbient + MaterialEmmisive);
static float3 SpecularColor = MaterialSpecular * LightSpecular;
bool parthf;
bool transp;
bool spadd;
#define SKII1 1500
#define SKII2 8000
#define Toon 3

texture ObjectTexture : MATERIALTEXTURE;
sampler ObjTexSampler = sampler_state {
    texture = <ObjectTexture>;
    MINFILTER = LINEAR;
    MAGFILTER = LINEAR;
};

texture ObjectSphereMap : MATERIALSPHEREMAP;
sampler ObjSphareSampler = sampler_state {
    texture = <ObjectSphereMap>;
    MINFILTER = LINEAR;
    MAGFILTER = LINEAR;
};

sampler MMDSamp0 : register(s0);
sampler MMDSamp1 : register(s1);
sampler MMDSamp2 : register(s2);

float4 ColorRenderVS(float4 Pos : POSITION) : POSITION
{
    return mul(Pos, WorldViewProjMatrix);
}

float4 ColorRenderPS() : COLOR
{
    return EdgeColor;
}

technique EdgeTec < string MMDPass = "edge"; >
{
    pass DrawEdge
    {
        AlphaBlendEnable = FALSE;
        AlphaTestEnable = FALSE;
        VertexShader = compile vs_2_0 ColorRenderVS();
        PixelShader = compile ps_2_0 ColorRenderPS();
    }
}

struct VS_OUTPUT
{
    float4 Pos : POSITION;
    float2 Tex : TEXCOORD1;
    float3 Normal : TEXCOORD2;
    float3 Eye : TEXCOORD3;
    float2 SpTex : TEXCOORD4;
    float4 Color : COLOR0;
};

VS_OUTPUT Basic_VS(float4 Pos : POSITION, float3 Normal : NORMAL, float2 Tex : TEXCOORD0,
        uniform bool useTexture, uniform bool useSphereMap, uniform bool useToon)
{
    VS_OUTPUT Out = (VS_OUTPUT)0;

    Out.Pos = mul(Pos, WorldViewProjMatrix);
    Out.Eye = CameraPosition - mul(Pos, WorldMatrix).xyz;
    Out.Normal = normalize(mul(Normal, (float3x3)WorldMatrix));
    Out.Color.rgb = AmbientColor;
    if (!useToon)
        Out.Color.rgb += max(0, dot(Out.Normal, -LightDirection)) * DiffuseColor.rgb;
    Out.Color.a = DiffuseColor.a;
    Out.Color = saturate(Out.Color);
    Out.Tex = Tex;
    if (useSphereMap)
    {
        float2 NormalWV = mul(Out.Normal, (float3x3)ViewMatrix).xy;
        Out.SpTex.x = NormalWV.x * 0.5f + 0.5f;
        Out.SpTex.y = NormalWV.y * -0.5f + 0.5f;
    }
    return Out;
}

float4 Basic_PS(VS_OUTPUT IN, uniform bool useTexture, uniform bool useSphereMap, uniform bool useToon) : COLOR0
{
    float3 HalfVector = normalize(normalize(IN.Eye) + -LightDirection);
    float3 Specular = pow(max(0, dot(HalfVector, normalize(IN.Normal))), SpecularPower) * SpecularColor;

    float4 Color = IN.Color;
    if (useTexture)
        Color *= tex2D(ObjTexSampler, IN.Tex);
    if (useSphereMap)
        Color.rgb += tex2D(ObjSphareSampler, IN.SpTex).rgb;
    if (useToon)
    {
        float LightNormal = dot(IN.Normal, -LightDirection);
        Color.rgb *= lerp(MaterialToon, float3(1, 1, 1), saturate(LightNormal * 16 + 0.5));
    }
    Color.rgb += Specular;
    return Color;
}

technique MainTec0 < string MMDPass = "object"; bool UseTexture = false; bool UseSphereMap = false; bool UseToon = false; >
{
    pass DrawObject
    {
        VertexShader = compile vs_2_0 Basic_VS(false, false, false);
        PixelShader = compile ps_2_0 Basic_PS(false, false, false);
    }
}

technique MainTec1 < string MMDPass = "object"; bool UseTexture = true; bool UseSphereMap = false; bool UseToon = false; >
{
    pass DrawObject
    {
        VertexShader = compile vs_2_0 Basic_VS(true, false, false);
        PixelShader = compile ps_2_0 Basic_PS(true, false, false);
    }
}

technique MainTec7 < string MMDPass = "object"; bool UseTexture = true; bool UseSphereMap = true; bool UseToon = true; >
{
    pass DrawObject
    {
        VertexShader = compile vs_2_0 Basic_VS(true, true, true);
        PixelShader = compile ps_2_0 Basic_PS(true, true, true);
    }
}

texture2D ScnMap : RENDERCOLORTARGET <
    float2 ViewPortRatio = {1.0, 1.0};
    int MipLevels = 1;
    string Format = "A8R8G8B8";
>;
sampler2D ScnSamp = sampler_state {
    texture = <ScnMap>;
    MinFilter = POINT;
    MagFilter = POINT;
    MipFilter = NONE;
    AddressU = CLAMP;
    AddressV = CLAMP;
};

technique ZplotTec < string MMDPass = "zplot"; > { }
technique ShadowTec < string MMDPass = "shadow"; > { }
