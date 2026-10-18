"""Hunyuan3D-2 HTTP wrapper for Artifact Lens.

Exposes exactly the two endpoints the Node backend expects:
  GET  /health    -> {"ok": true}
  POST /generate  -> GLB bytes (Content-Type: model/gltf-binary)
                     body: {"images": [{"angle": "front", "image": "<base64 jpeg>"}]}

Runs everywhere: `uvicorn hy3d_server:app --host 0.0.0.0 --port 8080`
Used by services/hunyuan/Dockerfile and by the Google Colab setup alike,
so local, Colab, and cloud behavior are identical.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "Hunyuan3D-2"))

from fastapi import FastAPI, Response
from pydantic import BaseModel
import base64
import io
from PIL import Image

MODEL_ID = os.environ.get("HUNYUAN_MODEL_ID", "tencent/Hunyuan3D-2mini")

pipe = None


def get_pipe():
    global pipe
    if pipe is None:
        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline

        pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(MODEL_ID)
    return pipe


app = FastAPI(title="artifact-lens-3d")


class GenReq(BaseModel):
    images: list


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/generate")
def generate(req: GenReq):
    frames = []
    for item in req.images or []:
        raw = item.get("image", "") if isinstance(item, dict) else item
        if "," in raw:
            raw = raw.split(",").pop()
        frames.append(Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB"))
    if not frames:
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=400, content={"error": "No images provided."})
    mesh = get_pipe()(image=frames[0])[0]
    buf = io.BytesIO()
    mesh.export(buf, file_type="glb")
    return Response(buf.getvalue(), media_type="model/gltf-binary")
