FROM golang:1.25-alpine AS builder

WORKDIR /src

ENV GOPROXY=https://goproxy.cn,direct 

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/bin/server ./cmd/api

FROM alpine:3.20

RUN apk --no-cache add ca-certificates

WORKDIR /app
COPY --from=builder /app/bin/server /app/bin/server

EXPOSE 8080
CMD ["/app/bin/server"]
