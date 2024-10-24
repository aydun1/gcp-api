import { exec } from 'shelljs';
import { createTransport, SentMessageInfo } from 'nodemailer';
import { mailerConfig } from '../config';

export async function runShellCmd(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, async (code, stdout, stderr) => {
      if (!code) {
        return resolve(stdout);
      }
      return reject(stderr);
    });
  });
}

export async function sendEmail(to: string[], subject: string, html: string): Promise<SentMessageInfo> {
  const transporter = createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
      user: mailerConfig.username,
      pass: mailerConfig.password
    }
  });
  return transporter.sendMail({from: '"IMS" <ims@gardencityplastics.com>', to, subject, text: html.replace(/<br>/gm, '\n'), html});
}