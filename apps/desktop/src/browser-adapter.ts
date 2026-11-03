import type { ArchiveApi, SearchHit } from './types';
const examples: SearchHit[] = [
  {id:1,title:'Factura de electricidad',path:'demo/factura-electricidad.pdf',page:1,locator:'Página 1',excerpt:'Factura de electricidad. El importe total de esta factura es de 42 euros.',score:0,tags:['Hogar','Facturas'],mime:'application/pdf'},
  {id:2,title:'Contrato de alquiler',path:'demo/contrato-alquiler.pdf',page:2,locator:'Página 2',excerpt:'Contrato de alquiler. La finalización del contrato requiere un aviso con 30 días de antelación.',score:0,tags:['Vivienda','Contratos'],mime:'application/pdf'},
  {id:3,title:'Manual de la lavadora',path:'demo/manual-lavadora.pdf',page:3,locator:'Página 3',excerpt:'Manual de la lavadora. Limpie el filtro de la lavadora cada mes. Se recomienda una limpieza mensual del filtro.',score:0,tags:['Hogar','Manuales'],mime:'application/pdf'},
];
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
export function createBrowserAdapter(): ArchiveApi {
  let loaded = false;
  return {
    demoLoad: async () => { loaded = true; return examples.length; },
    indexStatus: async () => ({files:loaded ? examples.length : 0, mode:'browser-demo'}),
    indexClear: async () => { loaded = false; },
    documentGet: async (id: number) => {
      const hit = loaded ? examples.find(doc => doc.id === id) : undefined;
      return hit ? {...hit,tags:[...hit.tags]} : null;
    },
    search: async (query: string): Promise<SearchHit[]> => {
      const stop = new Set(['que','cuanto','cuanta','como','cual','cuando','de','del','el','la','las','los','un','una','es','se','en','con','para','por','y','mi','al','hay','tengo']);
      const terms = normalize(query).match(/[a-z0-9]+/g)?.filter(term => !stop.has(term)) ?? [];
      if (!loaded || !terms.length) return [];
      return examples.map(doc => {
        const text = normalize([doc.title,doc.excerpt,...doc.tags].join(' '));
        return {...doc,tags:[...doc.tags],score:terms.filter(term => text.includes(term)).length};
      }).filter(doc => doc.score > 0).sort((a,b) => b.score - a.score);
    },
  };
}
