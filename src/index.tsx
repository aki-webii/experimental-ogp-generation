/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  // MY_KV_NAMESPACE: KVNamespace;
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  // MY_DURABLE_OBJECT: DurableObjectNamespace;
  //
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  // MY_BUCKET: R2Bucket;
  //
  // Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
  // MY_SERVICE: Fetcher;
}

import satori, { init } from "satori/wasm";
import initYoga from "yoga-wasm-web";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

// @ts-ignore
import yogaWasm from "../node_modules/yoga-wasm-web/dist/yoga.wasm";
// @ts-ignore
import resvgWasm from "../node_modules/@resvg/resvg-wasm/index_bg.wasm";

// module類の初期化
init(await initYoga(yogaWasm as WebAssembly.Module));
await initWasm(resvgWasm);

// フォントファイルを格納するための変数
let fontArrBuf: null | ArrayBuffer = null;

// `fetch()` の第2引数として渡ってくる `env` に対してR2 bucketの生やすために、型を拡張して定義しておきます。
type Handler = ExportedHandler<{
  OGP_GENERATION_TEST: R2Bucket;
}>;

// 型付けしているのをわかりやすくするために、型定義と導入を上部で行い、ファイル下部で `export default handler` しています。
// `export default { ... } as Handler` とする形もあり得ると思います。
const handler: Handler = {
  fetch: async (request, env) => {
    // リクエストURLのパラメータを取得
    const requestUrl = new URL(request.url)
    if (!requestUrl.searchParams.has('param')) {
      return new Response("Hissu parameter ga nai desu...", {
        status: 500,
        headers: {
          "Content-Type": "text/plain",
        },
      });
    }
    const exampleParam = requestUrl.searchParams.get('param')

    // R2 bucket内にキャッシュされた画像があれば、それを返す
    const cachedImage = await env.OGP_GENERATION_TEST.get(
      `ogp-image-caches/${exampleParam}.png`
    );
    if (cachedImage !== null && typeof cachedImage !== "undefined") {
      return new Response(await cachedImage.arrayBuffer(), {
        headers: {
          "X-Is-Cached": "true",
          "Content-Type": "image/png",
          "Cache-Control": "max-age=604800",
        },
      });
    }

    // フォントファイルをまだ取得していなければ、取得してArrayBufferとして格納
    if (fontArrBuf === null) {
      const fontObj = await env.OGP_GENERATION_TEST.get(
        "fonts/NotoSansJP-Regular.otf"
      );

      if (fontObj === null || typeof fontObj === "undefined") {
        return new Response("Font nai desu...", {
          status: 500,
          headers: {
            "Content-Type": "text/plain",
          },
        });
      }

      fontArrBuf = await fontObj.arrayBuffer();
    }

    const ZeroMarginParagraph = ({
      children,
    }: {
      children: React.ReactNode;
    }) => <p style={{ margin: 0, padding: 0 }}>{children}</p>;

    const ogpNode = (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(to bottom, #4481F9, #CC61A4)",
        }}
      >
        <div
          style={{
            padding: "48px 96px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#25293D",
            fontSize: "76px",
            color: "white",
          }}
        >
          <ZeroMarginParagraph>Chottoshita</ZeroMarginParagraph>
          <ZeroMarginParagraph>OGP Gazou</ZeroMarginParagraph>
          <ZeroMarginParagraph>Desu</ZeroMarginParagraph>
        </div>
      </div>
    );

    // Satoriを使ってsvgを生成する
    const svg = await satori(ogpNode, {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "NotoSansJP",
          data: fontArrBuf,
          weight: 100,
          style: "normal",
        },
      ],
    });

    // og:imageはsvgは対応していないので、pngに変換する
    const png = new Resvg(svg).render().asPng();

    // 生成した画像をR2 bucketにキャッシュしておく
    await env.OGP_GENERATION_TEST.put(
      `ogp-image-caches/${exampleParam}.png`,
      png
    );

    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        // ブラウザでもキャッシュしてもらいましょうか
        "Cache-Control": "max-age=604800",
      },
    });
  },
};

export default handler;
