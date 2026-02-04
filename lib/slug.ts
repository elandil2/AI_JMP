const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

export const generateSlug = (length = 10) => {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
};
