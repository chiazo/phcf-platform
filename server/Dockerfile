FROM golang:1.26 AS builder

WORKDIR /app
COPY . .
RUN go build -o app export.go main.go

FROM debian:bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y ca-certificates

COPY --from=builder /app/app .

EXPOSE 8080

CMD ["./app", "serve", "--http=0.0.0.0:8080"]