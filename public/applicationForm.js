const HILITE_COLOR = 'rgba(255, 204, 0, 0.5)'
const HILITE_MS = 2500

const f = document.querySelector('#form')
const d1 = f.querySelector('#degree1')
const j1 = f.querySelector('#job1')
const sub = f.querySelector('#apply')
const inv = document.querySelector('#invitation')
const cp = document.querySelector('#copy')

console.log(cp)
console.log(navigator.clipboard)
cp.onclick = async (ev) => {
  const res = await navigator.clipboard.writeText(inv.value)
  console.log(res)
}

f.onsubmit = async (ev) => {
  ev.preventDefault()
  console.log('Submitting...')
  console.log([d1.value, j1.value])
//  console.log(JSON.stringify(sub, null, 1))
  const res = await fetch('./', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(sub)
  })
  try {
    const json = await res.json()
    console.log(json)
    const msg = 'Application sent.'
    const p = document.createElement('p')
    p.textContent = msg
    f.parentElement.appendChild(p)
  }
  catch(e) {
    console.error(e)
    console.log(await res.text())
  }
}
