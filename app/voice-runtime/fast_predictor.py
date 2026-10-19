"""Benchmark-only fixed-length predictor loop; leaves installed packages untouched."""
from types import SimpleNamespace
import torch

def direct_predict(predictor, embeds, do_sample=True, top_k=50, temperature=0.9):
    cache=None
    token=None
    tokens=[]
    for step in range(predictor.config.num_code_groups-1):
        out=predictor(input_ids=token, inputs_embeds=embeds if step==0 else None,
                      past_key_values=cache, use_cache=True, generation_steps=step,
                      attention_mask={'full_attention':None},
                      output_hidden_states=False, return_dict=True)
        cache=out.past_key_values
        logits=out.logits[:,-1,:].float()
        if do_sample:
            logits=logits/temperature
            if top_k:
                threshold=torch.topk(logits,min(top_k,logits.shape[-1]))[0][:,-1,None]
                logits=logits.masked_fill(logits<threshold,-float('inf'))
            token=torch.multinomial(torch.softmax(logits,dim=-1),num_samples=1)
        else:
            token=logits.argmax(dim=-1,keepdim=True)
        tokens.append(token)
    return torch.cat(tokens,dim=-1)

class FastPredictor:
    def __init__(self, predictor, use_graph=False):
        self.predictor=predictor
        self.graph=None
        if use_graph:
            width=predictor.get_input_embeddings()[0].embedding_dim
            self.buffer=torch.zeros((1,2,width),device='cuda',dtype=torch.bfloat16)
            stream=torch.cuda.Stream()
            stream.wait_stream(torch.cuda.current_stream())
            with torch.cuda.stream(stream),torch.inference_mode():
                for _ in range(3): direct_predict(predictor,self.buffer)
            torch.cuda.current_stream().wait_stream(stream)
            torch.cuda.synchronize()
            self.graph=torch.cuda.CUDAGraph()
            with torch.cuda.graph(self.graph),torch.inference_mode():
                self.output=direct_predict(predictor,self.buffer)

    def __call__(self,inputs_embeds,**kwargs):
        if self.graph is not None:
            assert inputs_embeds.shape==self.buffer.shape
            self.buffer.copy_(inputs_embeds)
            self.graph.replay()
            return SimpleNamespace(sequences=self.output.clone())
        return SimpleNamespace(sequences=direct_predict(self.predictor,inputs_embeds,
            do_sample=kwargs.get('do_sample',True),top_k=kwargs.get('top_k',50),
            temperature=kwargs.get('temperature',0.9)))
