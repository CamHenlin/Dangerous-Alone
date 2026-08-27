"""
Image-model backends, behind one interface.

Two are worth having, and they behave differently in a way that has already
caused one wasted pass:

  mflux  `--image PATH STRENGTH` is init-image *influence* — 1.0 leaves the
         input untouched, 0.0 ignores it.
  SDXL   `strength` is *denoise amount* — 0.0 leaves the input untouched, 1.0
         ignores it.

They are inverses. Each backend therefore keeps its own parameter with its own
name and its own documented meaning, rather than a shared "strength" that means
opposite things depending on which model is loaded.

Measured on identical inputs, prompt and seed: SDXL with a pixel-art LoRA lands
2.4x closer to the game's palette than FLUX.2-klein (mean RGB distance to the
nearest legal colour, 9.1 vs 22.0) and runs about 2.3x faster. Every model
mflux ships is trained on photographs and illustrations; a LoRA trained on
pixel art is the only thing here that matches the domain.
"""

from pathlib import Path


class FluxBackend:
    """FLUX.2-klein via mflux. Held-influence semantics."""

    name = "flux2-klein"

    def __init__(self, quantize=4, steps=12, influence=0.55, mode="img2img"):
        self.quantize = quantize
        self.steps = steps
        self.influence = influence
        self.mode = mode
        self._model = None

    def signature(self):
        return f"flux2-klein|{self.mode}|{self.steps}|{self.influence}|{self.quantize}"

    def _load(self):
        if self._model is None:
            from mflux.models.common.config import ModelConfig
            from mflux.models.flux2.variants import Flux2Klein, Flux2KleinEdit

            print(f"loading FLUX.2-klein-4B (quantize={self.quantize})...")
            cfg = ModelConfig.from_name("flux2-klein-4b")
            cls = Flux2KleinEdit if self.mode == "edit" else Flux2Klein
            self._model = cls(model_config=cfg, quantize=self.quantize)
        return self._model

    def generate(self, src, width, height, prompt, seed):
        kwargs = dict(seed=seed, prompt=prompt, num_inference_steps=self.steps,
                      width=width, height=height, guidance=1.0)
        if self.mode == "edit":
            kwargs["image_paths"] = [str(src)]
        else:
            kwargs["image_path"] = str(src)
            kwargs["image_strength"] = self.influence
        return self._load().generate_image(**kwargs).image


class SdxlPixelArtBackend:
    """SDXL img2img with a pixel-art LoRA. Denoise-amount semantics."""

    name = "sdxl-pixelart"

    NEGATIVE = (
        "blurry, photorealistic, 3d render, soft gradient, text, watermark, "
        "frame, border, drop shadow"
    )

    def __init__(self, denoise=0.45, steps=30, guidance=7.0, lora_scale=1.0):
        self.denoise = denoise
        self.steps = steps
        self.guidance = guidance
        self.lora_scale = lora_scale
        self._pipe = None
        self._warned = False

    def signature(self):
        return f"sdxl-pixelart|{self.denoise}|{self.steps}|{self.guidance}|{self.lora_scale}"

    def _load(self):
        if self._pipe is None:
            import torch
            from diffusers import AutoencoderKL, StableDiffusionXLImg2ImgPipeline

            print("loading SDXL + pixel-art LoRA...")
            vae = AutoencoderKL.from_pretrained(
                "madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16)
            pipe = StableDiffusionXLImg2ImgPipeline.from_pretrained(
                "stabilityai/stable-diffusion-xl-base-1.0",
                vae=vae, torch_dtype=torch.float16, variant="fp16")
            pipe.load_lora_weights(
                "nerijs/pixel-art-xl", weight_name="pixel-art-xl.safetensors")
            pipe.fuse_lora(lora_scale=self.lora_scale)
            pipe.to("mps")
            pipe.set_progress_bar_config(disable=True)
            self._pipe = pipe
        return self._pipe

    def _check_prompt(self, pipe, prompt):
        """Fail loudly if CLIP would truncate.

        diffusers only logs this, and the log is long enough that it went
        unnoticed while every sprite was generated from a prompt cut off after
        its first sentence — losing the tile description, the transparency rule
        and everything else. A silent 95% loss is not something to warn about.
        """
        n = len(pipe.tokenizer(prompt)["input_ids"])
        limit = pipe.tokenizer.model_max_length
        if n > limit and not self._warned:
            self._warned = True
            raise ValueError(
                f"prompt is {n} tokens but CLIP truncates at {limit}; "
                f"shorten it (see build_short_prompt) rather than losing the tail:\n{prompt}"
            )

    def generate(self, src, width, height, prompt, seed):
        import torch
        from PIL import Image

        img = Image.open(src).convert("RGB")
        self._check_prompt(self._load(), prompt)
        out = self._load()(
            prompt=prompt,
            negative_prompt=self.NEGATIVE,
            image=img,
            strength=self.denoise,
            num_inference_steps=self.steps,
            guidance_scale=self.guidance,
            generator=torch.Generator("cpu").manual_seed(seed),
        ).images[0]
        # SDXL rounds to its own latent grid; bring it back to the exact size the
        # caller asked for so the center crop still lands on a cell boundary.
        if out.size != (width, height):
            out = out.resize((width, height), Image.LANCZOS)
        return out


def make_backend(name, **kw):
    if name == "sdxl-pixelart":
        return SdxlPixelArtBackend(**kw)
    return FluxBackend(**kw)
