# `desplegado/` — qué ve el cliente, contra el código actual

🔴 **ESTA CARPETA NO ES EL PAR DE A6, Y NO PUEDEN COMPARTIR CARPETA.** Son dos preguntas
distintas, y confundirlas ya pasó una vez —el 2026-09-03 una recaptura contra la URL desplegada
**sobreescribió** `app/mostrador-normal.png`, borrando el par actual y dejando en su lugar la
imagen de un bundle de hacía dieciocho commits—.

| carpeta | qué compara | contra qué |
|---|---|---|
| `app/` + `maqueta/` | **el código actual** | la maqueta — *¿construimos lo que se diseñó?* |
| `desplegado/` | **qué ve el cliente** | el código actual — *¿está desplegado lo que construimos?* |

⚠️ **La diferencia no es de origen sino de PREGUNTA.** Un par de A6 con una divergencia significa
*«hay que arreglar la pantalla»*; una divergencia acá significa *«hay que desplegar»* — o peor,
*«el deploy apunta a otro lado»*. La acción es opuesta, así que mezclarlas hace que se lea la
respuesta equivocada.

## Cómo se captura

```bash
node docs/auditorias/A6/capturar.mjs https://<url-desplegada> mostrador
# y se MUEVE a desplegado/ — el script escribe en app/ por diseño
```

⚠️ El script escribe en `app/`, así que después de capturar contra una URL desplegada hay que
mover el archivo y **restaurar `app/` desde git**. Es la trampa que ya mordió.

## Y lo que se compara primero no es la imagen: es el BUNDLE

Antes de mirar píxeles, `grep` de testids que sólo existen en el código nuevo. Es más barato y da
una respuesta binaria:

```bash
curl -s <url>/assets/index-<hash>.js -o /tmp/dep.js
grep -c 'sidebar-org-name' /tmp/dep.js     # 0 = el deploy es viejo
```

⚠️ **Y el marcador tiene que ser uno que el commit INTRODUJO**, no uno que conservó — ver
`CLAUDE.md`, la undécima falla de instrumento.
