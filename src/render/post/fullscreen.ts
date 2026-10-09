import { AddEquation, CustomBlending, OneFactor, ShaderMaterial, ZeroFactor } from 'three';

export const FX_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4( position.xy, 0.0, 1.0 );
  }
`;

export function createAdditiveMaterial(
  fragmentShader: string,
  uniforms: ShaderMaterial['uniforms'],
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms,
    vertexShader: FX_VERTEX,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
  });
}
