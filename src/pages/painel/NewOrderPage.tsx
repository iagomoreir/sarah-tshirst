import { useNavigate } from 'react-router-dom'
import { useCatalog } from '../../lib/useCatalog'
import { OrderForm } from '../../components/OrderForm'

/** Pedido lançado pela Sarah (bon de commande recebido em papel, por mensagem...) */
export function NewOrderPage() {
  const { catalog, loading } = useCatalog()
  const navigate = useNavigate()
  return (
    <div>
      <header className="panel-head">
        <h1>Novo pedido</h1>
        <p className="muted small">Dica: copie as linhas da planilha e cole na tabela.</p>
      </header>
      {loading ? <div className="sk sheet-sk" /> : <OrderForm catalog={catalog} mode="painel" onDone={() => navigate('/painel')} />}
    </div>
  )
}
