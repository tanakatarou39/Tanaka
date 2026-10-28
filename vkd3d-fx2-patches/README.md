# vkd3d-shader fx_2_0 state assignment patches

Patch series for upstream vkd3d (https://gitlab.winehq.org/wine/vkd3d), based on
commit dcefd8b0. It lets `vkd3d-shader` write fx_2_0 (Direct3D 9 effect) state
assignments other than constants: `compile` expressions, parameter references,
`sampler_state` initializers, `TRUE`/`FALSE`, and simple expressions (FXLC).

Apply with:

    git checkout dcefd8b0
    git am 000[1-9]-*.patch

`0000-cover-letter.patch` describes the series. `wine-d3dx9-test/` holds the
program used to load the output with Wine's d3dx9 and check the applied
states, and the logs of Wine 9.0's d3dx9 effect tests with and without the
patches.
