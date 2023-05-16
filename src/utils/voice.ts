/**
 * Voice Utils
 */
// @ts-ignore
import WxVoice from "wx-voice";
import {
    log,
  } from 'wechaty'
import path from "path";
// import { exec } from "child_process";

const voice = new WxVoice();
const outputFolder = process.env.OUTPUT_FOLDER || "output";

voice.on("error", (err: any) => log.error('err:', err));

function getTargetPath(filePath: string, ext: string) {
    const fileName = path.basename(filePath);
    const targetPath = path.resolve(
        outputFolder,
        fileName.replace(path.extname(filePath), ext)
    );
    return targetPath;
}

export async function convertSilkToWav(filePath: string) {
    log.info(filePath)
    const targetPath = getTargetPath(filePath, ".wav");
    log.info(outputFolder)
    log.info(targetPath)
    return new Promise<string>((resolve, reject) => {
        voice.decode(
            filePath,
            targetPath,
            {
                format: "wav",
            },
            (file: any) => {
                if (file) {
                    resolve(
                        path.join(
                            outputFolder,
                            path.relative(outputFolder, targetPath)
                        )
                    );
                } else {
                    reject(new Error("Failed to convert silk to wav"));
                }
            }
        );
    });
}

// export async function convertOgaToWay(filePath: string): Promise<string> {
//     const targetPath = getTargetPath(filePath, ".wav");
//     const cmd = `ffmpeg -i ${filePath} ${targetPath}`;
//     return new Promise((resolve, reject) => {
//         exec(cmd, (error: any, stdout: string, stderr: string) => {
//             if (error) {
//                 log.error('error', error);
//                 log.error('stderr', stderr);
//                 reject(error);
//             } else {
//                 log.info('stdout:', stdout);
//                 resolve(
//                     path.join(
//                         outputFolder,
//                         path.relative(outputFolder, targetPath)
//                     )
//                 );
//             }
//         });
//     });
// }

export async function getDuration(filePath: string) {
    return new Promise<number>((resolve, reject) => {
        voice.duration(filePath, (duration: number) => {
            if (duration) {
                resolve(duration);
            } else {
                reject(new Error("Failed to get duration"));
            }
        });
    });
}
