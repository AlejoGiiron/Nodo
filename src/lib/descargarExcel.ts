import { format } from 'date-fns'

/**
 * La ENTREGA de un libro de Excel, separada de su construcción.
 *
 * `src/lib/exportes.ts` arma el contenido —que es lo que se puede aseverar con
 * un test— y esto sólo lo baja. Vive acá y no dentro de una pantalla porque ya
 * son tres los libros que salen del producto, y un camino repetido en tres
 * lugares es R1 adentro de nuestro propio código.
 */
interface WorkbookDescargable {
  xlsx: { writeBuffer(): Promise<ArrayBuffer> }
}

export async function descargarWorkbook(wb: WorkbookDescargable, sufijo: string): Promise<void> {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `nodo_${sufijo}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
