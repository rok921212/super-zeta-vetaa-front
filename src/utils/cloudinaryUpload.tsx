import axios from "axios";

const CLOUD_NAME = "dczgqqgdp";

export const uploadToCloudinary = async (
  file: Blob,
  folder: string,
  uploadPreset: string,
  filename?: string
): Promise<string> => {

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Max file size is 5MB");
  }

  const formData = new FormData();
  if (filename) formData.append("file", file, filename);
  else formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  formData.append("folder", folder);

  const res = await axios.post(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    formData
  );

  return res.data.secure_url;
};
