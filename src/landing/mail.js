// Builds the contact address from its two halves, so it never appears whole in the pages'
// source, where spam bots look for addresses. A link is written as
//   <a data-mail-user="name" data-mail-host="example.com">name (at) example.com</a>
// and becomes a mailto link showing the address. Without JavaScript, the spelt-out text stays.
document.querySelectorAll('a[data-mail-user]').forEach((link) => {
  const address = `${link.dataset.mailUser}@${link.dataset.mailHost}`;
  link.href = `mailto:${address}`;
  link.textContent = address;
});
