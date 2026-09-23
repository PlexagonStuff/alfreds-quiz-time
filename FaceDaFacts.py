"""
===============================================================================
  FaceDaFacts.py
===============================================================================
  Project   : Home Assistant Robot
  Team      : Cedarville University — Senior Design

  Description:
    Pygame-based animated robot face renderer. Supports neutral,
    thinking, happy, sad, derpy, and sleepy expressions with
    randomised blinking, PIL-rendered mouth curves, bowtie
    decoration, and animated sleep-Z particles.

  Author(s):
    David Pascual
    Jonathan Clevenger

  Created : Oct 24, 2025
  Modified:
    Mar 08, 2025  Refactored into class structure (v4.0.0)
    Mar 12, 2026  Added eye movement capabilities (v5.0.0)
===============================================================================
"""

# ============================ IMPORTS ============================
import sys
import random
import pygame
import math
from PIL import Image, ImageDraw

# ============================ CONSTANTS ============================

FACE_CHOICE = "happy"
BLINK_MIN = 2000
BLINK_MAX = 5000
BLINK_DURATION = 100

VALID_EXPRESSIONS = ["neutral", "thinking", "happy", "sad", "derpy", "sleepy", "open"]

# ============================ EYE HELPERS ============================
class FaceRenderer:
    def __init__(self):
        print("Creating Graphics Surface")

    def draw_circle(self, surface, x, y, radius, color, width=0):
        pygame.draw.circle(surface, color, (int(x), int(y)), int(radius), int(width))
    
    def draw_line(self, surface, x1, y1, x2, y2, color, width=5):
        pygame.draw.line(surface, color, (int(x1), int(y1)), (int(x2), int(y2)), int(width))
    
    def draw_eyes(self, surface, W, H, strokeColor, is_blinking=False, expression="happy", direction="N"):
        eyeL = (W * 0.30, H * 0.25)
        eyeR = (W * 0.70, H * 0.25)
    
        eyeRadius = 75
        pupilRadius = 40
        pupilOffset = 15
        gazeOffset = 25

        if expression == "sleepy":
            upscale = 4
            Wh, Hh = W * upscale, H * upscale
    
            img = Image.new("RGBA", (Wh, Hh), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)
    
            stroke_w = 12 * upscale
            eye_width = 180 * upscale
            eye_height = 80 * upscale
    
            bboxL = [
                (eyeL[0] * upscale) - eye_width // 2,
                (eyeL[1] * upscale) - eye_height // 2,
                (eyeL[0] * upscale) + eye_width // 2,
                (eyeL[1] * upscale) + eye_height // 2
            ]
    
            bboxR = [
                (eyeR[0] * upscale) - eye_width // 2,
                (eyeR[1] * upscale) - eye_height // 2,
                (eyeR[0] * upscale) + eye_width // 2,
                (eyeR[1] * upscale) + eye_height // 2
            ]
    
            draw.arc(bboxL, start=20, end=160, fill=strokeColor + (255,), width=stroke_w)
            draw.arc(bboxR, start=20, end=160, fill=strokeColor + (255,), width=stroke_w)
    
            img = img.resize((W, H), Image.LANCZOS)
            eye_surface = pygame.image.fromstring(img.tobytes(), img.size, img.mode).convert_alpha()
            surface.blit(eye_surface, (0, 0))
            return
    
        if is_blinking:
            self.draw_line(surface, eyeL[0] - eyeRadius, eyeL[1], eyeL[0] + eyeRadius, eyeL[1], strokeColor, 6)
            self.draw_line(surface, eyeR[0] - eyeRadius, eyeR[1], eyeR[0] + eyeRadius, eyeR[1], strokeColor, 6)
        elif direction == "R":
            self.draw_circle(surface, eyeL[0], eyeL[1], eyeRadius, strokeColor, 6)
            self.draw_circle(surface, eyeR[0], eyeR[1], eyeRadius, strokeColor, 6)

            self.draw_circle(surface, eyeL[0] - gazeOffset, eyeL[1] + 10, pupilRadius, strokeColor)
            self.draw_circle(surface, eyeR[0] - gazeOffset, eyeR[1] + 10, pupilRadius, strokeColor)

            self.draw_circle(surface, eyeL[0] - gazeOffset - 10, eyeL[1] - 5, 10, (255, 255, 255))
            self.draw_circle(surface, eyeR[0] - gazeOffset - 10, eyeR[1] - 5, 10, (255, 255, 255))        
        elif direction == "L":
            self.draw_circle(surface, eyeL[0], eyeL[1], eyeRadius, strokeColor, 6)
            self.draw_circle(surface, eyeR[0], eyeR[1], eyeRadius, strokeColor, 6)

            self.draw_circle(surface, eyeL[0] + gazeOffset, eyeL[1] + 10, pupilRadius, strokeColor)
            self.draw_circle(surface, eyeR[0] + gazeOffset, eyeR[1] + 10, pupilRadius, strokeColor)

            self.draw_circle(surface, eyeL[0] + gazeOffset - 10, eyeL[1] - 5, 10, (255, 255, 255))
            self.draw_circle(surface, eyeR[0] + gazeOffset - 10, eyeR[1] - 5, 10, (255, 255, 255))
        else: # direction == "N"
            self.draw_circle(surface, eyeL[0], eyeL[1], eyeRadius, strokeColor, 6)
            self.draw_circle(surface, eyeR[0], eyeR[1], eyeRadius, strokeColor, 6)
    
            self.draw_circle(surface, eyeL[0] + pupilOffset, eyeL[1] + pupilOffset, pupilRadius, strokeColor)
            self.draw_circle(surface, eyeR[0] - pupilOffset, eyeR[1] + pupilOffset, pupilRadius, strokeColor)
    
            self.draw_circle(surface, eyeL[0] - pupilOffset + 15, eyeL[1] - pupilOffset + 10, 10, (255, 255, 255))
            self.draw_circle(surface, eyeR[0] + pupilOffset - 45, eyeR[1] - pupilOffset + 10, 10, (255, 255, 255))
    
    # ============================ MOUTH FUNCTION ============================
    
    def make_mouth_surface(self,W, H, expression, stroke_color, bg_color, upscale):
        Wh, Hh = W * upscale, H * upscale
        stroke_w = int(6 * upscale)
    
        img = Image.new("RGBA", (Wh, Hh), bg_color)
        draw = ImageDraw.Draw(img)
    
        cx, cy = 0.5 * Wh, 0.55 * Hh
    
        if expression == "open":
            draw.ellipse((cx - 100 * upscale, cy - 50 * upscale,
                          cx + 100 * upscale, cy + 50 * upscale),
                         fill=(255, 255, 255, 255), outline=stroke_color + (255,), width=stroke_w)

        elif expression == "neutral":
            draw.line((cx - 100 * upscale, cy, cx + 100 * upscale, cy),
                      fill=stroke_color + (255,), width=stroke_w)
    
        elif expression == "thinking":
            draw.line((cx - 90 * upscale, cy + 30 * upscale,
                       cx + 90 * upscale, cy + 50 * upscale),
                      fill=stroke_color + (255,), width=stroke_w)
    
        elif expression == "sad":
            bbox = [cx - 100 * upscale, cy - 35 * upscale,
                    cx + 100 * upscale, cy + 35 * upscale]
            draw.arc(bbox, 180, 360, fill=stroke_color + (255,), width=stroke_w)
    
        elif expression == "happy":
            bbox = [cx - 100 * upscale, cy - 35 * upscale,
                    cx + 100 * upscale, cy + 35 * upscale]
            draw.arc(bbox, 0, 180, fill=stroke_color + (255,), width=stroke_w)
    
        elif expression == "derpy":
            draw.line((cx - 225 * upscale, cy - 100 * upscale,
                       cx + 225 * upscale, cy - 100 * upscale),
                      fill=stroke_color + (255,), width=stroke_w)
    
        elif expression == "sleepy":
            cx, cy = 0.5 * Wh, 0.60 * Hh
            draw.ellipse((cx - 30 * upscale, cy - 50 * upscale,
                          cx + 30 * upscale, cy + 50 * upscale),
                         fill=stroke_color + (255,))
    
        img = img.resize((W, H), Image.LANCZOS)
        return pygame.image.fromstring(img.tobytes(), img.size, img.mode).convert()
    
    # ============================ BOWTIE FUNCTION ============================
    
    def make_bowtie_surface(self,W, H, stroke_color, fill_color, upscale):
        Wh, Hh = W * upscale, H * upscale
        img = Image.new("RGBA", (Wh, Hh), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
    
        cx, cy = 0.5 * Wh, 0.70 * Hh
        w, h = 70 * upscale, 28 * upscale
        center_gap = 50 * upscale

        draw.polygon([(cx + center_gap, cy), (cx - w, cy - h), (cx - w, cy + h)],
                     fill=fill_color + (255,), outline=stroke_color + (255,))
        draw.polygon([(cx - center_gap, cy), (cx + w, cy - h), (cx + w, cy + h)],
                     fill=fill_color + (255,), outline=stroke_color + (255,))

        img = img.resize((W, H), Image.LANCZOS)
        return pygame.image.fromstring(img.tobytes(), img.size, img.mode).convert_alpha()

# ============================ SLEEP Z FUNCTION ============================

class SleepZ:
    def __init__(self, W, H):
        self.W = W
        self.H = H

        self.x = W * 0.55
        self.y = H * 0.55

        speed = random.uniform(1.5, 2.0)*10
        angle = math.radians(30)

        self.speed_x = speed * math.cos(angle)
        self.speed_y = speed * math.sin(angle)

        self.scale = random.uniform(0.8, 1.3)

        self.alpha = 255
        self.fade_rate = 1.5

    def update(self):
        self.y -= self.speed_y
        self.x += self.speed_x

        self.alpha -= self.fade_rate

    def alive(self):
        return self.alpha > 0

# ============================ FACE FUNCTION ============================

class FaceDisplay:
    def __init__(self, scr, expression="happy"):

        self.screen = scr

        self.W, self.H = self.screen.get_size()

        self.pgr = FaceRenderer()

        self.bg = (255, 255, 255)
        self.stroke = (0, 0, 0)

        pygame.display.set_caption("Robot Face")

        self.clock = pygame.time.Clock()
        self.expression = expression
        self.paused = False
        self.running = True

        self.mouth = self.pgr.make_mouth_surface(self.W, self.H, expression,
                                        self.stroke, self.bg, 4)
        self.bowtie = self.pgr.make_bowtie_surface(self.W, self.H,
                                          self.stroke, self.stroke, 4)

        self.is_blinking = False
        self.next_blink = pygame.time.get_ticks() + random.randint(BLINK_MIN, BLINK_MAX)
        self.blink_end = 0

        self.sleep_zs = []
        self.last_z_spawn = pygame.time.get_ticks()

        self.direction = "N"

    def set_expression(self, expression):
        if expression in VALID_EXPRESSIONS and expression != self.expression:
            self.expression = expression
            self.mouth = self.pgr.make_mouth_surface(self.W, self.H, expression,
                                            self.stroke, self.bg, 4)
            
    def set_direction(self, direction):
        if direction in ["L", "R", "N"]:
            self.direction = direction

    def draw_z(self, z):
        size = int(50 * z.scale)

        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        stroke_w = 6
        color = (0, 0, 0, int(z.alpha))

        draw.line((0, 0, size, 0), fill=color, width=stroke_w)
        draw.line((size, 0, 0, size), fill=color, width=stroke_w)
        draw.line((0, size, size, size), fill=color, width=stroke_w)

        z_surface = pygame.image.fromstring(img.tobytes(), img.size, img.mode).convert_alpha()
        self.screen.blit(z_surface, (z.x, z.y))

    def update(self):
        if self.paused or not self.running:
            return

        pygame.display.set_caption("Robot Face")

        now = pygame.time.get_ticks()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_q:
                    self.running = False

        if not self.is_blinking and now >= self.next_blink:
            self.is_blinking = True
            self.blink_end = now + BLINK_DURATION
        elif self.is_blinking and now >= self.blink_end:
            self.is_blinking = False
            self.next_blink = now + random.randint(BLINK_MIN, BLINK_MAX)

        if self.expression == "sleepy":
            if now - self.last_z_spawn > 2000:
                self.sleep_zs.append(SleepZ(self.W, self.H))
                self.last_z_spawn = now

        self.screen.fill(self.bg)
        self.screen.blit(self.mouth, (0, 0))
        self.screen.blit(self.bowtie, (0, 0))

        self.pgr.draw_eyes(self.screen, self.W, self.H,
                  self.stroke, self.is_blinking, self.expression, direction=self.direction)

        if self.expression == "sleepy":
            for z in self.sleep_zs:
                z.update()

            self.sleep_zs = [z for z in self.sleep_zs if z.alive()]

            for z in self.sleep_zs:
                self.draw_z(z)

        pygame.display.flip()

if __name__ == "__main__":
    pygame.init()
    screen = pygame.display.set_mode((1024, 724), pygame.FULLSCREEN)
    expression = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] in VALID_EXPRESSIONS else "happy"
    face = FaceDisplay(screen, expression=expression)
    pygame.mouse.set_visible(False)
    while face.running:
        face.update()
    pygame.quit()
