async function test() {
  const res = await fetch('https://data.jsdelivr.com/v1/package/gh/n8n-io/n8n@2.23.4');
  const data = await res.json();
  console.log(Object.keys(data));
}
test();
