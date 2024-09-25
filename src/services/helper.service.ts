import { exec } from 'shelljs';

export async function runShellCmd(cmd: string) {
  return new Promise((resolve, reject) => {
    exec(cmd, async (code, stdout, stderr) => {
      console.log(code);
      console.log(stdout);
      console.log(stderr);
      if (!code) {
        return resolve(stdout);
      }
      return reject(stderr);
    });
  });
}