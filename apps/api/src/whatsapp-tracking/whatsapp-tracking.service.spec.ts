import { parseInboundEvolutionMessage } from './whatsapp-tracking.service';
describe('Evolution ingress filter',()=>{
  const raw={ event:'messages.upsert', instance:'wayta-test',
    data:{ key:{ id:'ABCD12345',fromMe:false,remoteJid:'123@s.whatsapp.net' },
      message:{ conversation:'An actual order from Wayta with reference' } } };
  it('accepts inbound text only',()=>{
    expect(parseInboundEvolutionMessage(raw)).toEqual({
      id:'ABCD12345',text:'An actual order from Wayta with reference',
    });
  });
  it('ignores groups, outgoing messages, media, and other events',()=>{
    expect(parseInboundEvolutionMessage({ ...raw,event:'messages.update' })).toBeNull();
    expect(parseInboundEvolutionMessage({ ...raw,data:{
      ...raw.data,key:{ ...raw.data.key,fromMe:true },
    } })).toBeNull();
    expect(parseInboundEvolutionMessage({ ...raw,data:{
      ...raw.data,key:{ ...raw.data.key,remoteJid:'123@g.us' },
    } })).toBeNull();
    expect(parseInboundEvolutionMessage({ ...raw,data:{
      ...raw.data,message:{ audioMessage:{} },
    } })).toBeNull();
  });
});
