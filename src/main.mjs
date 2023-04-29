import { unlink } from "fs/promises";
import http from "http";
import https from "https";
import fs from "fs";
import dotenv from "dotenv";
import { VK } from "vk-io";
import { createS3Client } from "./s3-client.mjs";

dotenv.config();

export class App {
  token = process.env["TOKEN"];
  bucket = process.env["TARGET_BUCKET"];
  s3Client = createS3Client();

  async download(url, name) {
    const path = `./uploads/${name}`;
    const file = fs.createWriteStream(path);

    await new Promise(function (resolve, reject) {
      return https.get(url).on("response", function (res) {
        const len = parseInt(res.headers["content-length"], 10);
        let downloaded = 0;
        let percent = "0";
        res
          .on("data", function (chunk) {
            file.write(chunk);
            downloaded += chunk.length;
            percent = ((100.0 * downloaded) / len).toFixed(2);
            process.stdout.write(
              `Downloading ${percent}% ${downloaded} bytes\r`
            );
          })
          .on("end", function () {
            file.end();
            console.log(`downloaded to: ${path}`);
            resolve(true);
          })
          .on("error", function (err) {
            reject(err);
          });
      });
    });

    await this.s3Client.send(
      new PutObjectCommand({
        Key: name,
        Bucket: this.bucket,
        Body: createReadStream(path),
      })
    );

    await unlink(path);
  }

  getBestQuality(files) {
    const mp4 = Object.keys(files).filter((url) => url.includes("mp4"));
    return mp4[mp4.length - 1];
  }

  async downloadVKVideo(videoId) {
    const vk = new VK({ token: this.token });

    const videos = await vk.api.video.get({ videos: [videoId] });
    const video = videos.items?.[0];

    if (!video || video.content_restricted) return;

    const videoUrl = video.files[this.getBestQuality(video.files)];

    return this.download(videoUrl, `${video.id}.mp4`);
  }
}

const app = new App();

const server = http.createServer(async (req, res) => {
  if (req.url.match(/\/download\/(.*?)/) && req.method === "GET") {
    const id = req.url.split("/")[2];

    app.downloadVKVideo(id);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(id);
    res.end();
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Route not found" }));
  }
});

const PORT = 3000;

server.listen(PORT, () => {
  console.log(`server started on port: ${PORT}`);
});
