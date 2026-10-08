import { buildMesh } from './index';
import type { MeshRequest, MeshResponse } from './protocol';

function collectTransferables(response: MeshResponse): Transferable[] {
  if (!response.ok) return [];
  const buffers: Transferable[] = [];
  for (const mesh of response.result.meshes) {
    buffers.push(
      mesh.positions.buffer,
      mesh.normals.buffer,
      mesh.uvs.buffer,
      mesh.colors.buffer,
      mesh.indices.buffer,
    );
  }
  return buffers;
}

self.onmessage = (event: MessageEvent<MeshRequest>) => {
  const { id, volume, atlas, options } = event.data;
  let response: MeshResponse;
  try {
    response = { id, ok: true, result: buildMesh(volume, atlas, options) };
  } catch (error) {
    response = { id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response, collectTransferables(response));
};
