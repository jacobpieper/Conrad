export const rendererShader = /* wgsl */ `
struct Viewport {
  size: vec2f,
}

@group(0) @binding(0) var<uniform> viewport: Viewport;
@group(0) @binding(1) var imageSampler: sampler;
@group(0) @binding(2) var imageTexture: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var output: VertexOutput;
  let x = f32((vertexIndex << 1u) & 2u);
  let y = f32(vertexIndex & 2u);
  output.position = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let imageSize = vec2f(textureDimensions(imageTexture));
  let scale = min(viewport.size.x / imageSize.x, viewport.size.y / imageSize.y);
  let displaySize = imageSize * scale;
  let offset = (viewport.size - displaySize) * 0.5;
  let uv = (input.position.xy - offset) / displaySize;

  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) {
    return vec4f(16.0 / 255.0, 16.0 / 255.0, 16.0 / 255.0, 1.0);
  }

  let intensity = textureSampleLevel(imageTexture, imageSampler, uv, 0.0).r;
  return vec4f(intensity, intensity, intensity, 1.0);
}
`
