# 使用 Alpine + apk，避免 deb.debian.org 在部分网络下 502。
# numpy / scikit-learn 等如缺轮子在构建期需编译，保留 g++ 与数值库头文件。
ARG PYTHON_BASE_IMAGE=python:3.11-alpine
FROM ${PYTHON_BASE_IMAGE}

WORKDIR /app

RUN apk add --no-cache \
    gcc g++ musl-dev linux-headers \
    postgresql-dev \
    openblas-dev lapack-dev gfortran \
    jpeg-dev zlib-dev

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
# Railway 注入 $PORT；本地 docker-compose 不设置 PORT 时降级到 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
