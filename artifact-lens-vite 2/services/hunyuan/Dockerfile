# Hunyuan3D-2 engine sidecar for Artifact Lens.
# CUDA 12.1 runtime, ~10GB image. Needs an NVIDIA GPU with 12GB+ VRAM.
FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    HUNYUAN_MODEL_ID=tencent/Hunyuan3D-2mini

WORKDIR /opt/engine

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip git \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/Tencent/Hunyuan3D-2.git /opt/engine/Hunyuan3D-2

RUN pip3 install --no-cache-dir --upgrade pip \
 && pip3 install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu121 \
 && pip3 install --no-cache-dir -r /opt/engine/Hunyuan3D-2/requirements.txt \
      fastapi "uvicorn[standard]" pillow trimesh

# Build context is the repo root (see docker-compose.yml):
#   build: { context: ., dockerfile: services/hunyuan/Dockerfile }
COPY server/hunyuan_server.py /opt/engine/hy3d_server.py

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD python3 -c "import urllib.request,sys;sys.exit(0 if urllib.request.urlopen('http://localhost:8080/health',timeout=8).status==200 else 1)"

CMD ["uvicorn", "hy3d_server:app", "--host", "0.0.0.0", "--port", "8080", "--app-dir", "/opt/engine"]
