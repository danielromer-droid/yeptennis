document.querySelector('.menu').addEventListener('click', () => {
  const nav = document.querySelector('nav');
  nav.classList.toggle('mobile-open');
});

document.querySelectorAll('.tabs button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('selected'));
    button.classList.add('selected');
  });
});
