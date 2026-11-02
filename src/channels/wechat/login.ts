import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import qrcodeTerminal from "qrcode-terminal";
import { ILINK_DEFAULT_BASE_URL, ILinkApiClient, type ILinkCredentials } from "./ilink-api.js";

const LOGIN_TIMEOUT_MS = 8 * 60_000;
const QR_REFRESH_LIMIT = 3;

function safeRedirectBaseUrl(host: string): string {
  if (!host || host.includes("/") || host.includes("@") || /[\r\n]/.test(host)) {
    throw new Error("iLink returned an invalid redirect host");
  }
  return "https://" + host;
}

async function showQr(api: ILinkApiClient): Promise<{ qrcode: string; startedAt: number }> {
  const qr = await api.getQrCode();
  stdout.write("\n请使用你的微信扫描以下二维码：\n");
  qrcodeTerminal.generate(qr.qrcode_img_content, { small: true });
  stdout.write("备用二维码地址：" + qr.qrcode_img_content + "\n");
  return { qrcode: qr.qrcode, startedAt: Date.now() };
}

export async function loginWithQr(options: {
  api?: ILinkApiClient;
  timeoutMs?: number;
} = {}): Promise<ILinkCredentials> {
  const api = options.api ?? new ILinkApiClient(ILINK_DEFAULT_BASE_URL);
  const timeoutMs = options.timeoutMs ?? LOGIN_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let qr = await showQr(api);
  let refreshCount = 1;
  let verifyCode: string | undefined;
  let scannedNoticeShown = false;
  const terminal = createInterface({ input: stdin, output: stdout });

  try {
    while (Date.now() < deadline) {
      let status;
      try {
        status = await api.getQrStatus(qr.qrcode, verifyCode);
      } catch (error) {
        if (Date.now() >= deadline) break;
        stdout.write("二维码状态暂时无法获取，将继续重试：" + (error instanceof Error ? error.message : String(error)) + "\n");
        await new Promise(resolve => setTimeout(resolve, 1500));
        continue;
      }

      switch (status.status) {
        case "wait":
          if (Date.now() - qr.startedAt > 4 * 60_000) {
            if (refreshCount >= QR_REFRESH_LIMIT) throw new Error("二维码多次过期，请稍后重新执行 pilink login");
            qr = await showQr(api);
            refreshCount += 1;
            scannedNoticeShown = false;
          }
          break;
        case "scaned":
          verifyCode = undefined;
          if (!scannedNoticeShown) {
            stdout.write("已扫码，正在等待微信确认……\n");
            scannedNoticeShown = true;
          }
          break;
        case "need_verifycode":
          verifyCode = (await terminal.question("请输入微信客户端显示的数字验证码：")).trim();
          if (!/^\d{4,8}$/.test(verifyCode)) {
            stdout.write("验证码格式不正确，请重新输入。\n");
            verifyCode = undefined;
          }
          break;
        case "verify_code_blocked":
          verifyCode = undefined;
          if (refreshCount >= QR_REFRESH_LIMIT) throw new Error("验证码错误次数过多，请稍后重新登录");
          qr = await showQr(api);
          refreshCount += 1;
          scannedNoticeShown = false;
          break;
        case "expired":
          if (refreshCount >= QR_REFRESH_LIMIT) throw new Error("二维码多次过期，请稍后重新执行 pilink login");
          qr = await showQr(api);
          refreshCount += 1;
          scannedNoticeShown = false;
          break;
        case "scaned_but_redirect":
          if (status.redirect_host) api.setBaseUrl(safeRedirectBaseUrl(status.redirect_host));
          break;
        case "binded_redirect":
          throw new Error("该微信 Bot 已绑定到其他客户端。请先在微信侧解除原绑定，再重新执行 pilink login。");
        case "confirmed": {
          if (!status.bot_token || !status.ilink_bot_id || !status.ilink_user_id) {
            throw new Error("微信确认登录，但服务端没有返回完整的 Bot 凭据和所有者 ID");
          }
          const baseUrl = status.baseurl ? new URL(status.baseurl).toString() : api.getBaseUrl();
          if (new URL(baseUrl).protocol !== "https:") throw new Error("iLink returned a non-HTTPS API base URL");
          stdout.write("微信扫码登录成功。\n");
          return {
            botToken: status.bot_token,
            ilinkBotId: status.ilink_bot_id,
            ownerUserId: status.ilink_user_id,
            baseUrl,
            connectedAt: new Date().toISOString()
          };
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error("等待微信扫码确认超时");
  } finally {
    terminal.close();
  }
}
