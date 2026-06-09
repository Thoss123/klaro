async function test() {
  const url = 'https://cdn.jsdelivr.net/gh/n8n-io/n8n@2.23.4/packages/frontend/@n8n/design-system/src/components/N8nIcon/nodes/if.svg';
  const res = await fetch(url);
  console.log('Status for if.svg:', res.status);
  const triggerRes = await fetch(url.replace('if.svg', 'trigger.svg'));
  console.log('Status for trigger.svg:', triggerRes.status);
}
test();
