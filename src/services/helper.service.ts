import { exec } from 'shelljs';

export async function runShellCmd(cmd: string) {
  return new Promise((resolve, reject) => {
    exec(cmd, async (code, stdout, stderr) => {
      if (!code) {
        return resolve(stdout);
      }
      return reject(stderr);
    });
  });
}