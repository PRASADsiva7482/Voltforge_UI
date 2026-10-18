import { useNavigate } from 'react-router-dom'
import AiChatPanel from './AiChatPanel'

export default function AiChatPage() {
  const navigate = useNavigate()
  return <AiChatPanel isOpen workspace readOnly onClose={() => navigate('/dashboard')} />
}
