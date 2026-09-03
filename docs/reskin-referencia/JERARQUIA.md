# Jerarquía de estas fuentes — leer antes de usar cualquiera

**La skill manda.** `.claude/skills/nodo-design-system/SKILL.md` es la fuente de verdad: los
valores de ahí son literales y exactos.

**La maqueta ilustra la skill.** `Nodo.html` muestra cómo se ven esos valores puestos juntos.
No los define.

**Las capturas ilustran la maqueta.** Los `*.png` son un atajo para mirar sin abrir el HTML.

> 🔴 **Si una captura contradice un token, gana el token.** Y si la maqueta contradice la skill,
> gana la skill y **se corrige la maqueta** — nunca al revés, y nunca en los dos lados a mano
> (R1: un valor en dos lugares sin nada que los sincronice).

⚠️ `nodo-design-system.md` es la **entrega original** y está **superada**: le faltan las cuatro
correcciones de captura y todo lo decidido desde el 2026-09-01. Se conserva como procedencia.
Para trabajar, la skill.

*(`LEEME.md` es el índice del paquete tal como se entregó; esta jerarquía es lo que se agregó al
meterlo al repo.)*


---

## 🔴 2026-09-03 · Estas capturas DEJAN DE SER FUENTE para la auditoría A6

*Medido al empezar A6, y es R4 aplicada a la referencia misma.*

Los archivos `*.png` de esta carpeta **son JPEG con extensión `.png`**, de ~30 KB, y su propio
`LEEME.md` (nota 7) lo dice: *"las capturas están escaladas para entrar en una sola imagen; las
medidas de verdad son las de §3, no las del PNG"*.

> **La captura de la maqueta no es la maqueta.** Es un proxy con pérdida — escalado, recomprimido y
> sin las medidas reales. Comparar la app contra ella mide el proxy, no la cosa.

**Lo que A6 usa en su lugar:** `Nodo.html` —la maqueta misma— renderizada por Playwright **al mismo
viewport que la app** (1440×900), con el mismo nombre de archivo, para que el par sea honesto:

```
node docs/auditorias/A6/capturar.mjs <baseURL> <pantalla ...>
  → docs/auditorias/A6/app/<pantalla>-normal.png
  → docs/auditorias/A6/maqueta/<pantalla>-normal.png
```

⚠️ **Para qué SIGUEN sirviendo estos `.png`:** para mirar rápido cómo debería verse algo sin abrir el
HTML — que es para lo que se justificaron al entrar al repo. **No** para medir, **no** para comparar,
y **no** para resolver una discusión sobre un valor: para eso manda la skill, después la maqueta.
