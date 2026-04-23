/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import COS from "cos-js-sdk-v5";

interface TempCredentials {
  CustomUrl: string;
  TmpSecretId: string;
  TmpSecretKey: string;
  SessionToken: string;
  StartTime: number;
  ExpiredTime: number;
  Bucket: string;
  Region: string;
  Key: string;
}

export const getOssTempConfig = (filename: string) => {
  return fetch(
    `https://opencamp.cn/api/oss/keyAndCredentials?filename=${filename}`
  ).then((res) => res.json() as Promise<TempCredentials>);
};

export function fileUpload(
  file: File,
  progressCallback?: (progress: number) => void
) {
  return new Promise<string>((resolve, reject) => {
    getOssTempConfig(file.name)
      .then((res) => {
        const data = res;
        // 服务端接口需要返回：上传的存储桶、地域、随机路径的对象键、临时密钥
        // 在返回值里取临时密钥信息，上传的文件路径信息
        const {
          TmpSecretId,
          TmpSecretKey,
          SessionToken,
          StartTime,
          ExpiredTime,
          Bucket,
          Region,
          Key,
          CustomUrl,
        } = data;
        // 创建 JS SDK 实例，传入临时密钥参数
        // 其他配置项可参考下方 初始化配置项
        const cos = new COS({
          SecretId: TmpSecretId,
          SecretKey: TmpSecretKey,
          SecurityToken: SessionToken,
          StartTime,
          ExpiredTime,
        });
        // 上传文件
        cos.uploadFile(
          {
            Bucket,
            Region,
            Key,
            Body: file, // 要上传的文件对象。
            onProgress: progressCallback
              ? (p: any) => progressCallback(p.percent)
              : undefined,
          },
          function (err: any) {
            if (err) {
              reject(err);
            } else {
              resolve(CustomUrl);
              console.log("上传成功");
            }
          }
        );
      })
      .catch((error) => {
        console.error("获取上传路径和临时密钥失败", error);
        reject(error);
      });
  });
}
