import { useNavigate } from 'react-router-dom'
import { useCatalog } from '../../lib/useCatalog'
import { OrderForm } from '../../components/OrderForm'

/** Devis lançado pela Sarah (bon de commande recebido em papel, por mensagem...) */
export function NewOrderPage() {
  const { catalog, loading } = useCatalog()
  const navigate = useNavigate()
  return (
    <div>
      <header className="panel-head">
        <h1>Nouveau devis</h1>
        <p className="muted small">Astuce : copiez les lignes du tableau Excel et collez-les dans le tableau.</p>
      </header>
      {loading ? <div className="sk sheet-sk" /> : <OrderForm catalog={catalog} mode="painel" onDone={(r) => {
            if (r.visuelsFailed.length) alert(`Devis enregistré, mais ces fichiers n’ont pas pu être envoyés : ${r.visuelsFailed.join(', ')}. Ajoutez-les depuis le devis.`)
            navigate('/painel/devis')
          }} />}
    </div>
  )
}
