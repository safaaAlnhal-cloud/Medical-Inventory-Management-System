// Saves a file the page already holds (a Blob) through the browser's normal download: a
// temporary link to it is clicked, then removed. The link's object URL is released a moment
// later, once the browser has started the download.
export const downloadFile = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
