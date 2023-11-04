export const slackToJson = (str: string) => {
  const result: Record<string, any> = {};

  // Split by '&' and iterate over each key-value pair
  str.split("&").forEach((pair: string) => {
    const [key, value] = pair.split("=");

    // Use decodeURIComponent to handle URL-encoded characters
    result[decodeURIComponent(key)] = decodeURIComponent(value);
  });

  return result;
};