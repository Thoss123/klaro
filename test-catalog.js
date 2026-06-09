async function test() {
  const res = await fetch('https://unpkg.com/n8n-nodes-base@2.15.1/dist/types/nodes.json');
  const nodes = await res.json();
  const arr = Array.isArray(nodes) ? nodes : Object.values(nodes);
  const theIf = arr.find(n => n.name === 'If');
  const trigNode = arr.find(n => n.name === 'ManualTrigger');
  console.log('IF:', theIf?.icon, theIf?.iconUrl);
  console.log('Trigger:', trigNode?.icon, trigNode?.iconUrl);
}
test();
